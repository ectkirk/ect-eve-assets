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
  MarketBulkResponseSchema,
  MarketBulkItemSchema,
  MarketJitaResponseSchema,
  MarketPlexResponseSchema,
  MarketContractsResponseSchema,
} from './schemas'
import { z } from 'zod'

export type MarketBulkItem = z.infer<typeof MarketBulkItemSchema>
export type RefType = z.infer<typeof RefTypeSchema>
export type RefUniverseItem = z.infer<typeof RefUniverseItemSchema>
export type UniverseEntityType = RefUniverseItem['type']

// Request coalescing - batches requests within a window to match API rate limit (30 req/min)
const REF_BATCH_DELAY_MS = 2000

let pendingLocationIds = new Set<number>()
let locationBatchPromise: Promise<Map<number, CachedLocation>> | null = null

let pendingTypeIds = new Set<number>()
let typeBatchPromise: Promise<Map<number, CachedType>> | null = null

let pendingPriceIds = new Set<number>()
let priceBatchPromise: Promise<Map<number, number>> | null = null

const PLEX_GROUP = 1875
const CONTRACT_GROUPS = new Set([883, 547, 4594, 485, 1538, 659, 30])

async function fetchTypesFromAPI(ids: number[]): Promise<Map<number, RefType>> {
  if (ids.length === 0) return new Map()

  const results = new Map<number, RefType>()
  const totalStart = performance.now()

  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000)
    const chunkStart = performance.now()

    try {
      const rawData = await window.electronAPI!.refTypes(chunk)
      const duration = Math.round(performance.now() - chunkStart)

      if (rawData && typeof rawData === 'object' && 'error' in rawData) {
        logger.warn('RefAPI /types failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
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

      const returned = Object.keys(parseResult.data.items).length
      logger.info(`RefAPI /types`, { module: 'RefAPI', requested: chunk.length, returned, duration })

      for (const [idStr, type] of Object.entries(parseResult.data.items)) {
        results.set(Number(idStr), type)
      }
    } catch (error) {
      logger.error('RefAPI /types error', error, { module: 'RefAPI' })
    }
  }

  if (ids.length > 1000) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info(`RefAPI /types total`, { module: 'RefAPI', requested: ids.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function fetchUniverseFromAPI(ids: number[]): Promise<Map<number, RefUniverseItem>> {
  if (ids.length === 0) return new Map()

  const results = new Map<number, RefUniverseItem>()
  const totalStart = performance.now()

  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000)
    const chunkStart = performance.now()

    try {
      const rawData = await window.electronAPI!.refUniverse(chunk)
      const duration = Math.round(performance.now() - chunkStart)

      if (rawData && typeof rawData === 'object' && 'error' in rawData) {
        logger.warn('RefAPI /universe failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
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

      const returned = Object.keys(parseResult.data.items).length
      logger.info(`RefAPI /universe`, { module: 'RefAPI', requested: chunk.length, returned, duration })

      for (const [idStr, item] of Object.entries(parseResult.data.items)) {
        results.set(Number(idStr), item)
      }
    } catch (error) {
      logger.error('RefAPI /universe error', error, { module: 'RefAPI' })
    }
  }

  if (ids.length > 1000) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info(`RefAPI /universe total`, { module: 'RefAPI', requested: ids.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function executeTypeBatch(): Promise<Map<number, CachedType>> {
  const idsToFetch = Array.from(pendingTypeIds)
  pendingTypeIds = new Set()

  const results = new Map<number, CachedType>()
  const uncachedIds: number[] = []

  for (const id of idsToFetch) {
    const cached = getType(id)
    if (cached) {
      results.set(id, cached)
    } else {
      uncachedIds.push(id)
    }
  }

  if (uncachedIds.length > 0) {
    logger.debug(`Fetching ${uncachedIds.length} types from ref API`, { module: 'RefAPI' })
    const fetched = await fetchTypesFromAPI(uncachedIds)
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
        implantSlot: refType.implantSlot,
        towerSize: refType.towerSize,
        fuelTier: refType.fuelTier,
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

export async function resolveTypes(typeIds: number[]): Promise<Map<number, CachedType>> {
  for (const id of typeIds) {
    pendingTypeIds.add(id)
  }

  if (!typeBatchPromise) {
    typeBatchPromise = new Promise((resolve) => {
      setTimeout(async () => {
        const result = await executeTypeBatch()
        typeBatchPromise = null
        resolve(result)
      }, REF_BATCH_DELAY_MS)
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

    if (fetched.size > 0) {
      for (const id of uncachedIds) {
        if (!fetched.has(id)) {
          const placeholder: CachedLocation = {
            id,
            name: `Unknown Location ${id}`,
            type: 'station',
          }
          results.set(id, placeholder)
          toCache.push(placeholder)
        }
      }
    }

    if (toCache.length > 0) {
      await saveLocations(toCache)
      logger.debug(`Cached ${toCache.length} locations (${fetched.size} resolved, ${toCache.length - fetched.size} unknown)`, { module: 'RefAPI' })
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
      }, REF_BATCH_DELAY_MS)
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

const THE_FORGE_REGION_ID = 10000002

interface MarketBulkOptions {
  avg?: boolean
  buy?: boolean
  jita?: boolean
}

async function fetchMarketFromAPI(
  typeIds: number[],
  options: MarketBulkOptions = {}
): Promise<Map<number, MarketBulkItem>> {
  if (typeIds.length === 0) return new Map()

  const results = new Map<number, MarketBulkItem>()
  const totalStart = performance.now()

  for (let i = 0; i < typeIds.length; i += 100) {
    const chunk = typeIds.slice(i, i + 100)
    const chunkStart = performance.now()

    try {
      const rawData = await window.electronAPI!.refMarket({
        regionId: THE_FORGE_REGION_ID,
        typeIds: chunk,
        ...options,
      })
      const duration = Math.round(performance.now() - chunkStart)

      if (rawData && typeof rawData === 'object' && 'error' in rawData) {
        logger.warn('RefAPI /market/bulk failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
        continue
      }

      const parseResult = MarketBulkResponseSchema.safeParse(rawData)
      if (!parseResult.success) {
        logger.error('RefAPI /market/bulk validation failed', undefined, {
          module: 'RefAPI',
          errors: parseResult.error.issues.slice(0, 3),
        })
        continue
      }

      const returned = Object.keys(parseResult.data.items).length
      logger.info(`RefAPI /market/bulk`, { module: 'RefAPI', requested: chunk.length, returned, duration })

      for (const [idStr, item] of Object.entries(parseResult.data.items)) {
        results.set(Number(idStr), item)
      }
    } catch (error) {
      logger.error('RefAPI /market/bulk error', error, { module: 'RefAPI' })
    }
  }

  if (typeIds.length > 100) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info(`RefAPI /market/bulk total`, { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function fetchJitaPricesFromAPI(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const results = new Map<number, number>()
  const totalStart = performance.now()

  for (let i = 0; i < typeIds.length; i += 1000) {
    const chunk = typeIds.slice(i, i + 1000)
    const chunkStart = performance.now()

    try {
      const rawData = await window.electronAPI!.refMarketJita(chunk)
      const duration = Math.round(performance.now() - chunkStart)

      if (rawData && typeof rawData === 'object' && 'error' in rawData) {
        logger.warn('RefAPI /market/jita failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
        continue
      }

      const parseResult = MarketJitaResponseSchema.safeParse(rawData)
      if (!parseResult.success) {
        logger.error('RefAPI /market/jita validation failed', undefined, {
          module: 'RefAPI',
          errors: parseResult.error.issues.slice(0, 3),
        })
        continue
      }

      let returned = 0
      for (const [idStr, price] of Object.entries(parseResult.data.items)) {
        if (price !== null && price > 0) {
          results.set(Number(idStr), price)
          returned++
        }
      }
      logger.info(`RefAPI /market/jita`, { module: 'RefAPI', requested: chunk.length, returned, duration })
    } catch (error) {
      logger.error('RefAPI /market/jita error', error, { module: 'RefAPI' })
    }
  }

  if (typeIds.length > 1000) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info(`RefAPI /market/jita total`, { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function fetchPlexPriceFromAPI(): Promise<number | null> {
  const start = performance.now()
  try {
    const rawData = await window.electronAPI!.refMarketPlex()
    const duration = Math.round(performance.now() - start)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /market/plex failed', { module: 'RefAPI', error: rawData.error, duration })
      return null
    }

    const parseResult = MarketPlexResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /market/plex validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return null
    }

    logger.info('RefAPI /market/plex', { module: 'RefAPI', duration })
    return parseResult.data.lowestSell
  } catch (error) {
    logger.error('RefAPI /market/plex error', error, { module: 'RefAPI' })
    return null
  }
}

async function fetchContractPricesFromAPI(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const results = new Map<number, number>()
  const totalStart = performance.now()

  for (let i = 0; i < typeIds.length; i += 100) {
    const chunk = typeIds.slice(i, i + 100)
    const chunkStart = performance.now()

    try {
      const rawData = await window.electronAPI!.refMarketContracts(chunk)
      const duration = Math.round(performance.now() - chunkStart)

      if (rawData && typeof rawData === 'object' && 'error' in rawData) {
        logger.warn('RefAPI /market/contracts failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
        continue
      }

      const parseResult = MarketContractsResponseSchema.safeParse(rawData)
      if (!parseResult.success) {
        logger.error('RefAPI /market/contracts validation failed', undefined, {
          module: 'RefAPI',
          errors: parseResult.error.issues.slice(0, 3),
        })
        continue
      }

      let returned = 0
      for (const [idStr, item] of Object.entries(parseResult.data.items)) {
        if (item.price !== null && item.price > 0 && item.hasSufficientData) {
          results.set(Number(idStr), item.price)
          returned++
        }
      }
      logger.info('RefAPI /market/contracts', { module: 'RefAPI', requested: chunk.length, returned, duration })
    } catch (error) {
      logger.error('RefAPI /market/contracts error', error, { module: 'RefAPI' })
    }
  }

  if (typeIds.length > 100) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/contracts total', { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration: totalDuration })
  }

  return results
}

function categorizeTypeIdsByEndpoint(typeIds: number[]): {
  plexIds: number[]
  contractIds: number[]
  jitaIds: number[]
} {
  const plexIds: number[] = []
  const contractIds: number[] = []
  const jitaIds: number[] = []

  for (const typeId of typeIds) {
    const cachedType = getType(typeId)
    const groupId = cachedType?.groupId ?? 0

    if (groupId === PLEX_GROUP) {
      plexIds.push(typeId)
    } else if (CONTRACT_GROUPS.has(groupId)) {
      contractIds.push(typeId)
    } else {
      jitaIds.push(typeId)
    }
  }

  return { plexIds, contractIds, jitaIds }
}

async function fetchPricesRouted(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const { plexIds, contractIds, jitaIds } = categorizeTypeIdsByEndpoint(typeIds)
  const results = new Map<number, number>()

  const promises: Promise<void>[] = []

  if (plexIds.length > 0) {
    promises.push(
      fetchPlexPriceFromAPI().then((price) => {
        if (price !== null) {
          for (const id of plexIds) {
            results.set(id, price)
          }
        }
      })
    )
  }

  if (contractIds.length > 0) {
    promises.push(
      fetchContractPricesFromAPI(contractIds).then((prices) => {
        for (const [id, price] of prices) {
          results.set(id, price)
        }
      })
    )
  }

  if (jitaIds.length > 0) {
    promises.push(
      fetchJitaPricesFromAPI(jitaIds).then((prices) => {
        for (const [id, price] of prices) {
          results.set(id, price)
        }
      })
    )
  }

  await Promise.all(promises)

  logger.info('Prices fetched', {
    module: 'RefAPI',
    total: typeIds.length,
    plex: plexIds.length,
    contracts: contractIds.length,
    jita: jitaIds.length,
    returned: results.size,
  })

  return results
}

async function executePriceBatch(): Promise<Map<number, number>> {
  const idsToFetch = Array.from(pendingPriceIds)
  pendingPriceIds = new Set()

  if (idsToFetch.length === 0) return new Map()

  return fetchPricesRouted(idsToFetch)
}

export async function queuePriceRefresh(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  for (const id of typeIds) {
    pendingPriceIds.add(id)
  }

  if (!priceBatchPromise) {
    priceBatchPromise = new Promise((resolve) => {
      setTimeout(async () => {
        const result = await executePriceBatch()
        priceBatchPromise = null
        resolve(result)
      }, REF_BATCH_DELAY_MS)
    })
  }

  const allResults = await priceBatchPromise
  const results = new Map<number, number>()
  for (const id of typeIds) {
    const price = allResults.get(id)
    if (price !== undefined) {
      results.set(id, price)
    }
  }
  return results
}

export async function fetchPrices(typeIds: number[]): Promise<Map<number, number>> {
  return fetchPricesRouted(typeIds)
}

export interface MarketComparisonPrices {
  averagePrice: number | null
  highestBuy: number | null
  lowestSell: number | null
}

export async function fetchMarketComparison(
  typeIds: number[]
): Promise<Map<number, MarketComparisonPrices>> {
  const fetched = await fetchMarketFromAPI(typeIds, { avg: true, buy: true, jita: true })
  const results = new Map<number, MarketComparisonPrices>()

  for (const [typeId, item] of fetched) {
    results.set(typeId, {
      averagePrice: item.averagePrice ?? null,
      highestBuy: item.highestBuy ?? null,
      lowestSell: item.lowestSell,
    })
  }

  return results
}
