import { logger } from '@/lib/logger'
import {
  getType,
  saveTypes,
  hasLocation,
  getLocation,
  saveLocations,
  type CachedType,
  type CachedLocation,
} from '@/store/reference-cache'
import {
  RefTypeBulkResponseSchema,
  RefUniverseBulkResponseSchema,
  RefTypeSchema,
  RefUniverseItemSchema,
} from './schemas'
import { z } from 'zod'

export type RefMarketPrice = z.infer<typeof RefTypeSchema>['marketPrice']
export type RefType = z.infer<typeof RefTypeSchema>
export type RefUniverseItem = z.infer<typeof RefUniverseItemSchema>
export type UniverseEntityType = RefUniverseItem['type']

// Request coalescing for locations - batches requests within a window
let pendingLocationIds = new Set<number>()
let locationBatchPromise: Promise<Map<number, CachedLocation>> | null = null
const LOCATION_BATCH_DELAY_MS = 50

// Request coalescing for types - batches requests within a window
let pendingTypeIds = new Set<number>()
let pendingTypeMarket: 'jita' | 'the_forge' = 'jita'
let typeBatchPromise: Promise<Map<number, CachedType>> | null = null
const TYPE_BATCH_DELAY_MS = 50

async function fetchTypesFromAPI(
  ids: number[],
  market: 'jita' | 'the_forge' = 'jita'
): Promise<Map<number, RefType>> {
  if (ids.length === 0) return new Map()

  const results = new Map<number, RefType>()

  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000)

    try {
      const rawData = await window.electronAPI!.refTypes(chunk, market)
      if (rawData && typeof rawData === 'object' && 'error' in rawData) {
        logger.warn('RefAPI /types failed', { module: 'RefAPI', error: rawData.error })
        continue
      }

      const parseResult = RefTypeBulkResponseSchema.safeParse(rawData)
      if (!parseResult.success) {
        logger.error('RefAPI /types validation failed', undefined, {
          module: 'RefAPI',
          errors: parseResult.error.issues.slice(0, 3),
        })
        continue
      }

      for (const [idStr, type] of Object.entries(parseResult.data.items)) {
        results.set(Number(idStr), type)
      }
    } catch (error) {
      logger.error('RefAPI /types error', error, { module: 'RefAPI' })
    }
  }

  return results
}

async function fetchUniverseFromAPI(ids: number[]): Promise<Map<number, RefUniverseItem>> {
  if (ids.length === 0) return new Map()

  const results = new Map<number, RefUniverseItem>()

  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000)

    try {
      const rawData = await window.electronAPI!.refUniverse(chunk)
      if (rawData && typeof rawData === 'object' && 'error' in rawData) {
        logger.warn('RefAPI /universe failed', { module: 'RefAPI', error: rawData.error })
        continue
      }

      const parseResult = RefUniverseBulkResponseSchema.safeParse(rawData)
      if (!parseResult.success) {
        logger.error('RefAPI /universe validation failed', undefined, {
          module: 'RefAPI',
          errors: parseResult.error.issues.slice(0, 3),
        })
        continue
      }

      for (const [idStr, item] of Object.entries(parseResult.data.items)) {
        results.set(Number(idStr), item)
      }
    } catch (error) {
      logger.error('RefAPI /universe error', error, { module: 'RefAPI' })
    }
  }

  return results
}

async function executeTypeBatch(): Promise<Map<number, CachedType>> {
  const idsToFetch = Array.from(pendingTypeIds)
  const market = pendingTypeMarket
  pendingTypeIds = new Set()
  pendingTypeMarket = 'jita'

  const results = new Map<number, CachedType>()
  const uncachedIds: number[] = []

  for (const id of idsToFetch) {
    const cached = getType(id)
    if (cached && !cached.name.startsWith('Unknown Type ')) {
      results.set(id, cached)
    } else {
      uncachedIds.push(id)
    }
  }

  if (uncachedIds.length > 0) {
    logger.debug(`Fetching ${uncachedIds.length} types from ref API`, { module: 'RefAPI' })
    const fetched = await fetchTypesFromAPI(uncachedIds, market)
    const toCache: CachedType[] = []

    for (const [id, refType] of fetched) {
      const cached: CachedType = {
        id: refType.id,
        name: refType.name,
        groupId: refType.groupId ?? 0,
        groupName: refType.groupName ?? '',
        categoryId: refType.categoryId ?? 0,
        categoryName: refType.categoryName ?? '',
        volume: refType.volume ?? 0,
        packagedVolume: refType.packagedVolume ?? undefined,
      }
      results.set(id, cached)
      toCache.push(cached)
    }

    // Cache placeholder entries for types not returned by API (BPCs, abyssals, etc.)
    for (const id of uncachedIds) {
      if (!fetched.has(id)) {
        const placeholder: CachedType = {
          id,
          name: `Unknown Type ${id}`,
          groupId: 0,
          groupName: '',
          categoryId: 0,
          categoryName: '',
          volume: 0,
        }
        results.set(id, placeholder)
        toCache.push(placeholder)
      }
    }

    if (toCache.length > 0) {
      await saveTypes(toCache)
      logger.debug(`Cached ${toCache.length} types (${fetched.size} resolved, ${uncachedIds.length - fetched.size} unknown)`, { module: 'RefAPI' })
    }
  }

  return results
}

export async function resolveTypes(
  typeIds: number[],
  market: 'jita' | 'the_forge' = 'jita'
): Promise<Map<number, CachedType>> {
  for (const id of typeIds) {
    pendingTypeIds.add(id)
  }
  pendingTypeMarket = market

  if (!typeBatchPromise) {
    typeBatchPromise = new Promise((resolve) => {
      setTimeout(async () => {
        const result = await executeTypeBatch()
        typeBatchPromise = null
        resolve(result)
      }, TYPE_BATCH_DELAY_MS)
    })
  }

  const allResults = await typeBatchPromise
  const results = new Map<number, CachedType>()
  for (const id of typeIds) {
    const cached = allResults.get(id) ?? getType(id)
    if (cached) {
      results.set(id, cached)
    }
  }
  return results
}

async function executeLocationBatch(): Promise<Map<number, CachedLocation>> {
  const idsToFetch = Array.from(pendingLocationIds)
  pendingLocationIds = new Set()

  const results = new Map<number, CachedLocation>()
  const uncachedIds: number[] = []

  for (const id of idsToFetch) {
    if (id > 1_000_000_000_000) continue
    if (hasLocation(id)) {
      results.set(id, getLocation(id)!)
    } else {
      uncachedIds.push(id)
    }
  }

  if (uncachedIds.length > 0) {
    logger.debug(`Fetching ${uncachedIds.length} locations from ref API: ${uncachedIds.join(', ')}`, { module: 'RefAPI' })
    const fetched = await fetchUniverseFromAPI(uncachedIds)
    const toCache: CachedLocation[] = []

    for (const [id, item] of fetched) {
      const cached: CachedLocation = {
        id,
        name: item.name,
        type: item.type,
        solarSystemId: item.solarSystemId,
        solarSystemName: item.solarSystemName,
        regionId: item.regionId,
        regionName: item.regionName,
      }
      results.set(id, cached)
      toCache.push(cached)
    }

    if (toCache.length > 0) {
      await saveLocations(toCache)
      logger.debug(`Cached ${toCache.length} locations`, { module: 'RefAPI' })
    }
  }

  return results
}

export async function resolveLocations(locationIds: number[]): Promise<Map<number, CachedLocation>> {
  for (const id of locationIds) {
    pendingLocationIds.add(id)
  }

  if (!locationBatchPromise) {
    locationBatchPromise = new Promise((resolve) => {
      setTimeout(async () => {
        const result = await executeLocationBatch()
        locationBatchPromise = null
        resolve(result)
      }, LOCATION_BATCH_DELAY_MS)
    })
  }

  const allResults = await locationBatchPromise
  const results = new Map<number, CachedLocation>()
  for (const id of locationIds) {
    const cached = allResults.get(id) ?? getLocation(id)
    if (cached) {
      results.set(id, cached)
    }
  }
  return results
}

export async function fetchPrices(
  typeIds: number[],
  market: 'jita' | 'the_forge' = 'jita'
): Promise<Map<number, number>> {
  const fetched = await fetchTypesFromAPI(typeIds, market)
  const prices = new Map<number, number>()
  const toCache: CachedType[] = []

  for (const [typeId, type] of fetched) {
    const lowestSell = type.marketPrice.lowestSell
    const average = type.marketPrice.average
    const price = lowestSell ?? (typeof average === 'string' ? parseFloat(average) : average) ?? 0
    if (price > 0) {
      prices.set(typeId, price)
    }

    toCache.push({
      id: type.id,
      name: type.name,
      groupId: type.groupId ?? 0,
      groupName: type.groupName ?? '',
      categoryId: type.categoryId ?? 0,
      categoryName: type.categoryName ?? '',
      volume: type.volume ?? 0,
      packagedVolume: type.packagedVolume ?? undefined,
    })
  }

  if (toCache.length > 0) {
    await saveTypes(toCache)
  }

  return prices
}
