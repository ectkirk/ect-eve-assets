import { i18n } from '@/i18n'
import { logger } from '@/lib/logger'
import { formatFullNumber } from '@/lib/utils'
import {
  getGroup,
  getCategory,
  isReferenceDataLoaded,
  isAllTypesLoaded,
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import { getLanguage } from '@/store/settings-store'
import {
  RefCategoriesResponseSchema,
  RefGroupsResponseSchema,
  RefCorporationsResponseSchema,
} from './schemas'

export type ReferenceDataProgress = (status: string) => void

export interface ReferenceDataResult {
  success: boolean
  errors: string[]
}

async function validateAndSave<T>(
  raw: unknown,
  config: {
    schema: {
      safeParse: (data: unknown) => {
        success: boolean
        data?: { items: Record<string, T> }
        error?: { issues: unknown[] }
      }
    }
    entityName: string
    save: (items: T[]) => Promise<void>
    errors: string[]
  },
): Promise<boolean> {
  if (raw && typeof raw === 'object' && 'error' in raw) {
    const errorMsg = `Failed to load ${config.entityName}: ${(raw as { error: string }).error}`
    logger.error(`Failed to load ${config.entityName}`, undefined, {
      module: 'RefAPI',
      error: (raw as { error: string }).error,
    })
    config.errors.push(errorMsg)
    return false
  }

  const result = config.schema.safeParse(raw)
  if (!result.success) {
    const errorMsg = `${config.entityName} validation failed`
    logger.error(`${config.entityName} validation failed`, undefined, {
      module: 'RefAPI',
      errors: result.error!.issues.slice(0, 3),
    })
    config.errors.push(errorMsg)
    return false
  }

  await config.save(Object.values(result.data!.items))
  return true
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
  name: string,
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
  portionSize?: number | null
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
    portionSize: raw.portionSize ?? undefined,
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
  onProgress?: ReferenceDataProgress,
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

    let categoriesOk = isReferenceDataLoaded()
    let groupsOk = isReferenceDataLoaded()

    if (!isReferenceDataLoaded()) {
      onProgress?.(i18n.t('status.loadingCategories'))
      const language = getLanguage()
      const [categoriesRaw, groupsRaw, corporationsRaw] = await Promise.all([
        window.electronAPI!.refCategories({ language }),
        window.electronAPI!.refGroups({ language }),
        window.electronAPI!.refCorporations({ language }),
      ])

      const [categoriesOkResult, groupsOkResult, corporationsOkResult] =
        await Promise.all([
          validateAndSave(categoriesRaw, {
            schema: RefCategoriesResponseSchema,
            entityName: 'categories',
            save: (items) =>
              useReferenceCacheStore.getState().setCategories(items),
            errors,
          }),
          validateAndSave(groupsRaw, {
            schema: RefGroupsResponseSchema,
            entityName: 'groups',
            save: (items) => useReferenceCacheStore.getState().setGroups(items),
            errors,
          }),
          validateAndSave(corporationsRaw, {
            schema: RefCorporationsResponseSchema,
            entityName: 'corporations',
            save: (items) =>
              useReferenceCacheStore.getState().setCorporations(items),
            errors,
          }),
        ])

      categoriesOk = categoriesOkResult
      groupsOk = groupsOkResult
      const corporationsOk = corporationsOkResult

      if (categoriesOk && groupsOk && corporationsOk) {
        useReferenceCacheStore.getState().setReferenceDataLoaded(true)
        const catGroupDuration = Math.round(performance.now() - start)
        logger.info('Categories, groups and corporations loaded', {
          module: 'RefAPI',
          duration: catGroupDuration,
        })
      }
    }

    if (!categoriesOk || !groupsOk) {
      errors.push('Skipped loading types: categories or groups unavailable')
      logger.warn('Skipping type loading due to missing categories/groups', {
        module: 'RefAPI',
        categoriesOk,
        groupsOk,
      })
    } else {
      const typesResult = await loadAllTypes(onProgress)
      if (typesResult.error) {
        errors.push(typesResult.error)
      }
    }

    const duration = Math.round(performance.now() - start)
    logger.info('Reference data loaded', { module: 'RefAPI', duration })

    return { success: errors.length === 0, errors }
  })().then(
    (result) => {
      referenceDataPromise = null
      return result
    },
    (error) => {
      // Keep rejected promise cached briefly to prevent retry races,
      // then clear so a future call can retry
      setTimeout(() => {
        referenceDataPromise = null
      }, 1000)
      throw error
    },
  )

  return referenceDataPromise
}

interface TypesLoadResult {
  error?: string
}

async function loadAllTypes(
  onProgress?: ReferenceDataProgress,
): Promise<TypesLoadResult> {
  if (isAllTypesLoaded()) return {}

  onProgress?.(i18n.t('status.loadingTypes'))
  const start = performance.now()
  const language = getLanguage()
  let cursor: number | undefined
  let total: number
  let loaded = 0
  let pageCount = 0

  do {
    const result = await window.electronAPI!.refTypesPage({
      after: cursor,
      language,
    })

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
      i18n.t('status.loadingTypesProgress', {
        loaded: formatFullNumber(loaded),
        total: formatFullNumber(total),
      }),
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
