import { logger } from '@/lib/logger'
import {
  getGroup,
  getCategory,
  setCategories,
  setGroups,
  setBlueprints,
  isReferenceDataLoaded,
  isAllTypesLoaded,
  setAllTypesLoaded,
  isBlueprintsLoaded,
  setBlueprintsLoaded,
  notifyCacheListeners,
  saveTypes,
  type CachedType,
  type CachedBlueprint,
} from '@/store/reference-cache'
import { RefCategoriesResponseSchema, RefGroupsResponseSchema } from './schemas'

export type ReferenceDataProgress = (status: string) => void

const CONTROL_TOWER_GROUP_ID = 365
const TIER_2_TOWER_PREFIXES = [
  'Dark Blood',
  'Dread Guristas',
  'Shadow',
  'Domination',
  'True Sansha',
]
const TIER_1_TOWER_PREFIXES = [
  'Angel',
  'Blood',
  'Guristas',
  'Sansha',
  'Serpentis',
]

function getTowerInfo(
  groupId: number,
  name: string
): { towerSize?: number; fuelTier?: number } {
  if (groupId !== CONTROL_TOWER_GROUP_ID) return {}

  const towerSize = name.includes('Small') ? 1 : name.includes('Medium') ? 2 : 3

  const fuelTier = TIER_2_TOWER_PREFIXES.some((p) => name.startsWith(p))
    ? 2
    : TIER_1_TOWER_PREFIXES.some((p) => name.startsWith(p))
      ? 1
      : 0

  return { towerSize, fuelTier }
}

interface RawType {
  id: number
  name: string
  groupId?: number | null
  volume?: number | null
  packagedVolume?: number | null
}

function enrichType(raw: RawType): CachedType {
  const groupId = raw.groupId ?? 0
  const group = getGroup(groupId)
  const category = group ? getCategory(group.categoryId) : undefined
  const towerInfo = getTowerInfo(groupId, raw.name)

  return {
    id: raw.id,
    name: raw.name,
    groupId,
    groupName: group?.name ?? '',
    categoryId: group?.categoryId ?? 0,
    categoryName: category?.name ?? '',
    volume: raw.volume ?? 0,
    packagedVolume: raw.packagedVolume ?? undefined,
    ...towerInfo,
  }
}

let referenceDataPromise: Promise<void> | null = null

export function _resetForTests(): void {
  referenceDataPromise = null
}

export async function loadReferenceData(
  onProgress?: ReferenceDataProgress
): Promise<void> {
  if (isReferenceDataLoaded() && isAllTypesLoaded() && isBlueprintsLoaded())
    return

  if (referenceDataPromise) {
    return referenceDataPromise
  }

  referenceDataPromise = (async () => {
    const start = performance.now()

    if (!isReferenceDataLoaded()) {
      onProgress?.('Loading categories...')
      const [categoriesRaw, groupsRaw] = await Promise.all([
        window.electronAPI!.refCategories(),
        window.electronAPI!.refGroups(),
      ])

      let categoriesOk = false
      let groupsOk = false

      if (categoriesRaw && 'error' in categoriesRaw) {
        logger.error('Failed to load categories', undefined, {
          module: 'RefAPI',
          error: categoriesRaw.error,
        })
      } else {
        const categoriesResult =
          RefCategoriesResponseSchema.safeParse(categoriesRaw)
        if (!categoriesResult.success) {
          logger.error('Categories validation failed', undefined, {
            module: 'RefAPI',
            errors: categoriesResult.error.issues.slice(0, 3),
          })
        } else {
          await setCategories(Object.values(categoriesResult.data.items))
          categoriesOk = true
        }
      }

      if (groupsRaw && 'error' in groupsRaw) {
        logger.error('Failed to load groups', undefined, {
          module: 'RefAPI',
          error: groupsRaw.error,
        })
      } else {
        const groupsResult = RefGroupsResponseSchema.safeParse(groupsRaw)
        if (!groupsResult.success) {
          logger.error('Groups validation failed', undefined, {
            module: 'RefAPI',
            errors: groupsResult.error.issues.slice(0, 3),
          })
        } else {
          await setGroups(Object.values(groupsResult.data.items))
          groupsOk = true
        }
      }

      if (categoriesOk && groupsOk) {
        const catGroupDuration = Math.round(performance.now() - start)
        logger.info('Categories and groups loaded', {
          module: 'RefAPI',
          duration: catGroupDuration,
        })
      }
    }

    await Promise.allSettled([loadAllTypes(onProgress), loadBlueprints()])

    const duration = Math.round(performance.now() - start)
    logger.info('Reference data loaded', { module: 'RefAPI', duration })
  })().finally(() => {
    referenceDataPromise = null
  })

  return referenceDataPromise
}

async function loadAllTypes(onProgress?: ReferenceDataProgress): Promise<void> {
  if (isAllTypesLoaded()) return

  onProgress?.('Loading types...')
  const start = performance.now()
  let cursor: number | undefined
  let total = 0
  let loaded = 0
  let pageCount = 0

  do {
    const result = await window.electronAPI!.refTypesPage({ after: cursor })

    if (result.error) {
      logger.error('Failed to load types page', undefined, {
        module: 'RefAPI',
        error: result.error,
        cursor,
      })
      return
    }

    if (!result.items || !result.pagination) {
      logger.error('Invalid types page response', undefined, {
        module: 'RefAPI',
        cursor,
      })
      return
    }

    const rawTypes = Object.values(result.items) as RawType[]
    total = result.pagination.total
    loaded += rawTypes.length
    pageCount++

    if (rawTypes.length > 0) {
      const enrichedTypes = rawTypes.map(enrichType)
      await saveTypes(enrichedTypes)
    }

    onProgress?.(
      `Loading types (${loaded.toLocaleString()}/${total.toLocaleString()})...`
    )

    cursor = result.pagination.hasMore
      ? result.pagination.nextCursor
      : undefined
  } while (cursor !== undefined)

  setAllTypesLoaded(true)
  notifyCacheListeners()

  const duration = Math.round(performance.now() - start)
  logger.info('All types loaded', {
    module: 'RefAPI',
    total: loaded,
    pages: pageCount,
    duration,
  })
}

async function loadBlueprints(): Promise<void> {
  if (isBlueprintsLoaded()) return

  const start = performance.now()

  const result = await window.electronAPI!.refBlueprints()

  if ('error' in result) {
    logger.error('Failed to load blueprints', undefined, {
      module: 'RefAPI',
      error: result.error,
    })
    return
  }

  const blueprints: CachedBlueprint[] = Object.entries(result.items).map(
    ([bpId, [productId, basePrice]]) => ({
      id: Number(bpId),
      productId,
      basePrice: basePrice ?? undefined,
    })
  )

  await setBlueprints(blueprints)
  setBlueprintsLoaded(true)
  notifyCacheListeners()

  const duration = Math.round(performance.now() - start)
  logger.info('Blueprints loaded', {
    module: 'RefAPI',
    count: blueprints.length,
    duration,
  })
}
