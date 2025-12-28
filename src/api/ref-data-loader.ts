import { logger } from '@/lib/logger'
import {
  getGroup,
  getCategory,
  isReferenceDataLoaded,
  isAllTypesLoaded,
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import { RefCategoriesResponseSchema, RefGroupsResponseSchema } from './schemas'

export type ReferenceDataProgress = (status: string) => void

export interface ReferenceDataResult {
  success: boolean
  errors: string[]
}

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

interface RawSlots {
  high: number
  mid: number
  low: number
  rig: number
  subsystem: number
  launcher: number
  turret: number
}

interface RawType {
  id: number
  name: string
  groupId?: number | null
  marketGroupId?: number | null
  volume?: number | null
  packagedVolume?: number | null
  isPublished?: number
  productId?: number | null
  basePrice?: number | null
  implantSlot?: number | null
  slots?: RawSlots | null
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
    marketGroupId: raw.marketGroupId,
    volume: raw.volume ?? 0,
    packagedVolume: raw.packagedVolume ?? undefined,
    published: raw.isPublished === 1,
    productId: raw.productId ?? undefined,
    basePrice: raw.basePrice ?? undefined,
    implantSlot: raw.implantSlot ?? undefined,
    slots: raw.slots ?? undefined,
    ...towerInfo,
  }
}

let referenceDataPromise: Promise<ReferenceDataResult> | null = null

export function _resetForTests(): void {
  referenceDataPromise = null
}

export async function loadReferenceData(
  onProgress?: ReferenceDataProgress
): Promise<ReferenceDataResult> {
  if (isReferenceDataLoaded() && isAllTypesLoaded()) {
    return { success: true, errors: [] }
  }

  if (referenceDataPromise) {
    return referenceDataPromise
  }

  referenceDataPromise = (async (): Promise<ReferenceDataResult> => {
    const start = performance.now()
    const errors: string[] = []

    if (!isReferenceDataLoaded()) {
      onProgress?.('Loading categories...')
      const [categoriesRaw, groupsRaw] = await Promise.all([
        window.electronAPI!.refCategories(),
        window.electronAPI!.refGroups(),
      ])

      let categoriesOk = false
      let groupsOk = false

      if (categoriesRaw && 'error' in categoriesRaw) {
        const errorMsg = `Failed to load categories: ${categoriesRaw.error}`
        logger.error('Failed to load categories', undefined, {
          module: 'RefAPI',
          error: categoriesRaw.error,
        })
        errors.push(errorMsg)
      } else {
        const categoriesResult =
          RefCategoriesResponseSchema.safeParse(categoriesRaw)
        if (!categoriesResult.success) {
          const errorMsg = 'Categories validation failed'
          logger.error('Categories validation failed', undefined, {
            module: 'RefAPI',
            errors: categoriesResult.error.issues.slice(0, 3),
          })
          errors.push(errorMsg)
        } else {
          await useReferenceCacheStore
            .getState()
            .setCategories(Object.values(categoriesResult.data.items))
          categoriesOk = true
        }
      }

      if (groupsRaw && 'error' in groupsRaw) {
        const errorMsg = `Failed to load groups: ${groupsRaw.error}`
        logger.error('Failed to load groups', undefined, {
          module: 'RefAPI',
          error: groupsRaw.error,
        })
        errors.push(errorMsg)
      } else {
        const groupsResult = RefGroupsResponseSchema.safeParse(groupsRaw)
        if (!groupsResult.success) {
          const errorMsg = 'Groups validation failed'
          logger.error('Groups validation failed', undefined, {
            module: 'RefAPI',
            errors: groupsResult.error.issues.slice(0, 3),
          })
          errors.push(errorMsg)
        } else {
          await useReferenceCacheStore
            .getState()
            .setGroups(Object.values(groupsResult.data.items))
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

    const typesResult = await loadAllTypes(onProgress)
    if (typesResult.error) {
      errors.push(typesResult.error)
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Reference data loaded', { module: 'RefAPI', duration })

    return { success: errors.length === 0, errors }
  })().finally(() => {
    referenceDataPromise = null
  })

  return referenceDataPromise
}

interface TypesLoadResult {
  error?: string
}

async function loadAllTypes(
  onProgress?: ReferenceDataProgress
): Promise<TypesLoadResult> {
  if (isAllTypesLoaded()) return {}

  onProgress?.('Loading types...')
  const start = performance.now()
  let cursor: number | undefined
  let total = 0
  let loaded = 0
  let pageCount = 0

  do {
    const result = await window.electronAPI!.refTypesPage({ after: cursor })

    if (result.error) {
      const errorMsg = `Failed to load types: ${result.error}`
      logger.error('Failed to load types page', undefined, {
        module: 'RefAPI',
        error: result.error,
        cursor,
      })
      return { error: errorMsg }
    }

    if (!result.items || !result.pagination) {
      const errorMsg = 'Failed to load types: invalid response'
      logger.error('Invalid types page response', undefined, {
        module: 'RefAPI',
        cursor,
      })
      return { error: errorMsg }
    }

    const rawTypes = Object.values(result.items) as RawType[]
    total = result.pagination.total
    loaded += rawTypes.length
    pageCount++

    if (rawTypes.length > 0) {
      const enrichedTypes = rawTypes.map(enrichType)
      await useReferenceCacheStore.getState().saveTypes(enrichedTypes)
    }

    onProgress?.(
      `Loading types (${loaded.toLocaleString()}/${total.toLocaleString()})...`
    )

    cursor = result.pagination.hasMore
      ? result.pagination.nextCursor
      : undefined
  } while (cursor !== undefined)

  useReferenceCacheStore.getState().setAllTypesLoaded(true)

  const duration = Math.round(performance.now() - start)
  logger.info('All types loaded', {
    module: 'RefAPI',
    total: loaded,
    pages: pageCount,
    duration,
  })

  return {}
}
