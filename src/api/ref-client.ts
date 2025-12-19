import { logger } from '@/lib/logger'
import {
  getType,
  saveTypes,
  hasLocation,
  getLocation,
  saveLocations,
  getGroup,
  getCategory,
  setCategories,
  setGroups,
  isReferenceDataLoaded,
  type CachedType,
  type CachedLocation,
} from '@/store/reference-cache'
import {
  RefTypeBulkResponseSchema,
  RefUniverseBulkResponseSchema,
  RefTypeSchema,
  RefUniverseItemSchema,
  RefCategoriesResponseSchema,
  RefGroupsResponseSchema,
  RefImplantsResponseSchema,
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

const PLEX_GROUP = 1875
const CONTRACT_GROUPS = new Set([883, 547, 4594, 485, 1538, 659, 30])
const CHUNK_CONCURRENCY = 3

const CONTROL_TOWER_GROUP_ID = 365
const TIER_2_TOWER_PREFIXES = ['Dark Blood', 'Dread Guristas', 'Shadow', 'Domination', 'True Sansha']
const TIER_1_TOWER_PREFIXES = ['Angel', 'Blood', 'Guristas', 'Sansha', 'Serpentis']

function getTowerInfo(groupId: number, name: string): { towerSize?: number; fuelTier?: number } {
  if (groupId !== CONTROL_TOWER_GROUP_ID) return {}

  const towerSize = name.includes('Small') ? 1
                  : name.includes('Medium') ? 2
                  : 3

  const fuelTier = TIER_2_TOWER_PREFIXES.some(p => name.startsWith(p)) ? 2
                 : TIER_1_TOWER_PREFIXES.some(p => name.startsWith(p)) ? 1
                 : 0

  return { towerSize, fuelTier }
}

async function processChunksParallel<T, R>(
  items: T[],
  chunkSize: number,
  processor: (chunk: T[]) => Promise<R>,
  merger: (results: R, accumulated: R) => void,
  initial: R
): Promise<R> {
  if (items.length === 0) return initial

  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  const results = initial
  let index = 0

  async function processNext(): Promise<void> {
    while (index < chunks.length) {
      const chunkIndex = index++
      const chunk = chunks[chunkIndex]
      if (!chunk) continue
      const result = await processor(chunk)
      merger(result, results)
    }
  }

  const workers = Array.from(
    { length: Math.min(CHUNK_CONCURRENCY, chunks.length) },
    () => processNext()
  )
  await Promise.all(workers)

  return results
}

let inFlightTypes: Promise<Map<number, RefType>> | null = null
let pendingTypeIds = new Set<number>()

let inFlightLocations: Promise<Map<number, RefUniverseItem>> | null = null
let pendingLocationIds = new Set<number>()

let referenceDataPromise: Promise<void> | null = null

export function _resetForTests(): void {
  inFlightTypes = null
  pendingTypeIds = new Set()
  inFlightLocations = null
  pendingLocationIds = new Set()
  referenceDataPromise = null
}

export async function loadReferenceData(): Promise<void> {
  if (isReferenceDataLoaded()) return

  if (referenceDataPromise) {
    return referenceDataPromise
  }

  referenceDataPromise = (async () => {
    const start = performance.now()

    const [categoriesRaw, groupsRaw] = await Promise.all([
      window.electronAPI!.refCategories(),
      window.electronAPI!.refGroups(),
    ])

    if (categoriesRaw && 'error' in categoriesRaw) {
      logger.error('Failed to load categories', undefined, { module: 'RefAPI', error: categoriesRaw.error })
      return
    }

    if (groupsRaw && 'error' in groupsRaw) {
      logger.error('Failed to load groups', undefined, { module: 'RefAPI', error: groupsRaw.error })
      return
    }

    const categoriesResult = RefCategoriesResponseSchema.safeParse(categoriesRaw)
    if (!categoriesResult.success) {
      logger.error('Categories validation failed', undefined, { module: 'RefAPI', errors: categoriesResult.error.issues.slice(0, 3) })
      return
    }

    const groupsResult = RefGroupsResponseSchema.safeParse(groupsRaw)
    if (!groupsResult.success) {
      logger.error('Groups validation failed', undefined, { module: 'RefAPI', errors: groupsResult.error.issues.slice(0, 3) })
      return
    }

    const categories = Object.values(categoriesResult.data.items)
    const groups = Object.values(groupsResult.data.items)

    setCategories(categories)
    setGroups(groups)

    const duration = Math.round(performance.now() - start)
    logger.info('Reference data loaded', { module: 'RefAPI', categories: categories.length, groups: groups.length, duration })
  })().finally(() => {
    if (!isReferenceDataLoaded()) {
      referenceDataPromise = null
    }
  })

  return referenceDataPromise
}

async function fetchTypesChunk(chunk: number[]): Promise<Map<number, RefType>> {
  const results = new Map<number, RefType>()
  const chunkStart = performance.now()

  try {
    const rawData = await window.electronAPI!.refTypes(chunk)
    const duration = Math.round(performance.now() - chunkStart)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /types failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
      return results
    }

    const parseResult = RefTypeBulkResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /types validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
    }

    const returned = Object.keys(parseResult.data.items).length
    logger.info('RefAPI /types', { module: 'RefAPI', requested: chunk.length, returned, duration })

    for (const [idStr, type] of Object.entries(parseResult.data.items)) {
      results.set(Number(idStr), type)
    }
  } catch (error) {
    logger.error('RefAPI /types error', error, { module: 'RefAPI' })
  }

  return results
}

async function fetchTypesFromAPI(ids: number[]): Promise<Map<number, RefType>> {
  if (ids.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    ids,
    1000,
    fetchTypesChunk,
    (chunk, acc) => { for (const [k, v] of chunk) acc.set(k, v) },
    new Map<number, RefType>()
  )

  if (ids.length > 1000) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /types total', { module: 'RefAPI', requested: ids.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function fetchUniverseChunk(chunk: number[]): Promise<Map<number, RefUniverseItem>> {
  const results = new Map<number, RefUniverseItem>()
  const chunkStart = performance.now()

  try {
    const rawData = await window.electronAPI!.refUniverse(chunk)
    const duration = Math.round(performance.now() - chunkStart)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /universe failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
      return results
    }

    const parseResult = RefUniverseBulkResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /universe validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
    }

    const returned = Object.keys(parseResult.data.items).length
    logger.info('RefAPI /universe', { module: 'RefAPI', requested: chunk.length, returned, duration })

    for (const [idStr, item] of Object.entries(parseResult.data.items)) {
      results.set(Number(idStr), item)
    }
  } catch (error) {
    logger.error('RefAPI /universe error', error, { module: 'RefAPI' })
  }

  return results
}

async function fetchUniverseFromAPI(ids: number[]): Promise<Map<number, RefUniverseItem>> {
  if (ids.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    ids,
    1000,
    fetchUniverseChunk,
    (chunk, acc) => { for (const [k, v] of chunk) acc.set(k, v) },
    new Map<number, RefUniverseItem>()
  )

  if (ids.length > 1000) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /universe total', { module: 'RefAPI', requested: ids.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function executeTypesFetch(): Promise<Map<number, RefType>> {
  const idsToFetch = Array.from(pendingTypeIds)
  pendingTypeIds = new Set()

  if (idsToFetch.length === 0) return new Map()

  logger.debug(`Fetching ${idsToFetch.length} types from ref API`, { module: 'RefAPI' })
  return fetchTypesFromAPI(idsToFetch)
}

export async function resolveTypes(typeIds: number[]): Promise<Map<number, CachedType>> {
  await loadReferenceData()

  const results = new Map<number, CachedType>()
  const uncachedIds: number[] = []

  for (const id of typeIds) {
    const cached = getType(id)
    if (cached) {
      results.set(id, cached)
    } else {
      uncachedIds.push(id)
      pendingTypeIds.add(id)
    }
  }

  if (uncachedIds.length === 0) return results

  if (!inFlightTypes) {
    inFlightTypes = executeTypesFetch().finally(() => { inFlightTypes = null })
  }

  const fetched = await inFlightTypes
  const toCache: CachedType[] = []

  for (const id of uncachedIds) {
    const existing = getType(id)
    if (existing) {
      results.set(id, existing)
      continue
    }

    const refType = fetched.get(id)
    if (refType) {
      const groupId = refType.groupId ?? 0
      const group = getGroup(groupId)
      const categoryId = group?.categoryId ?? 0
      const category = getCategory(categoryId)
      const towerInfo = getTowerInfo(groupId, refType.name)

      const cached: CachedType = {
        id: refType.id,
        name: refType.name,
        groupId,
        groupName: group?.name ?? '',
        categoryId,
        categoryName: category?.name ?? '',
        volume: refType.volume ?? 0,
        packagedVolume: refType.packagedVolume ?? undefined,
        ...towerInfo,
      }
      results.set(id, cached)
      toCache.push(cached)
    } else {
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
    logger.debug(`Cached ${toCache.length} types`, { module: 'RefAPI' })
  }

  return results
}

async function executeLocationsFetch(): Promise<Map<number, RefUniverseItem>> {
  const idsToFetch = Array.from(pendingLocationIds)
  pendingLocationIds = new Set()

  if (idsToFetch.length === 0) return new Map()

  logger.debug(`Fetching ${idsToFetch.length} locations from ref API`, { module: 'RefAPI' })
  return fetchUniverseFromAPI(idsToFetch)
}

export async function resolveLocations(locationIds: number[]): Promise<Map<number, CachedLocation>> {
  const results = new Map<number, CachedLocation>()
  const uncachedIds: number[] = []

  for (const id of locationIds) {
    if (id > 1_000_000_000_000) continue
    if (hasLocation(id)) {
      results.set(id, getLocation(id)!)
    } else {
      uncachedIds.push(id)
      pendingLocationIds.add(id)
    }
  }

  if (uncachedIds.length === 0) return results

  if (!inFlightLocations) {
    inFlightLocations = executeLocationsFetch().finally(() => { inFlightLocations = null })
  }

  const fetched = await inFlightLocations
  const toCache: CachedLocation[] = []

  for (const id of uncachedIds) {
    const existing = getLocation(id)
    if (existing) {
      results.set(id, existing)
      continue
    }

    const item = fetched.get(id)
    if (item) {
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
  }

  if (fetched.size > 0) {
    for (const id of uncachedIds) {
      if (!results.has(id)) {
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
    logger.debug(`Cached ${toCache.length} locations`, { module: 'RefAPI' })
  }

  return results
}

const THE_FORGE_REGION_ID = 10000002

interface MarketBulkOptions {
  avg?: boolean
  buy?: boolean
  jita?: boolean
}

function createMarketChunkFetcher(options: MarketBulkOptions) {
  return async (chunk: number[]): Promise<Map<number, MarketBulkItem>> => {
    const results = new Map<number, MarketBulkItem>()
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
        return results
      }

      const parseResult = MarketBulkResponseSchema.safeParse(rawData)
      if (!parseResult.success) {
        logger.error('RefAPI /market/bulk validation failed', undefined, {
          module: 'RefAPI',
          errors: parseResult.error.issues.slice(0, 3),
        })
        return results
      }

      const returned = Object.keys(parseResult.data.items).length
      logger.info('RefAPI /market/bulk', { module: 'RefAPI', requested: chunk.length, returned, duration })

      for (const [idStr, item] of Object.entries(parseResult.data.items)) {
        results.set(Number(idStr), item)
      }
    } catch (error) {
      logger.error('RefAPI /market/bulk error', error, { module: 'RefAPI' })
    }

    return results
  }
}

async function fetchMarketFromAPI(
  typeIds: number[],
  options: MarketBulkOptions = {}
): Promise<Map<number, MarketBulkItem>> {
  if (typeIds.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    typeIds,
    100,
    createMarketChunkFetcher(options),
    (chunk, acc) => { for (const [k, v] of chunk) acc.set(k, v) },
    new Map<number, MarketBulkItem>()
  )

  if (typeIds.length > 100) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/bulk total', { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function fetchJitaPricesChunk(chunk: number[]): Promise<Map<number, number>> {
  const results = new Map<number, number>()
  const chunkStart = performance.now()

  try {
    const rawData = await window.electronAPI!.refMarketJita(chunk)
    const duration = Math.round(performance.now() - chunkStart)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /market/jita failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
      return results
    }

    const parseResult = MarketJitaResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /market/jita validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
    }

    let returned = 0
    for (const [idStr, price] of Object.entries(parseResult.data.items)) {
      if (price !== null && price > 0) {
        results.set(Number(idStr), price)
        returned++
      }
    }
    logger.info('RefAPI /market/jita', { module: 'RefAPI', requested: chunk.length, returned, duration })
  } catch (error) {
    logger.error('RefAPI /market/jita error', error, { module: 'RefAPI' })
  }

  return results
}

async function fetchJitaPricesFromAPI(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    typeIds,
    1000,
    fetchJitaPricesChunk,
    (chunk, acc) => { for (const [k, v] of chunk) acc.set(k, v) },
    new Map<number, number>()
  )

  if (typeIds.length > 1000) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/jita total', { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration: totalDuration })
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

async function fetchContractPricesChunk(chunk: number[]): Promise<Map<number, number>> {
  const results = new Map<number, number>()
  const chunkStart = performance.now()

  try {
    const rawData = await window.electronAPI!.refMarketContracts(chunk)
    const duration = Math.round(performance.now() - chunkStart)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /market/contracts failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
      return results
    }

    const parseResult = MarketContractsResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /market/contracts validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
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

  return results
}

async function fetchContractPricesFromAPI(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    typeIds,
    100,
    fetchContractPricesChunk,
    (chunk, acc) => { for (const [k, v] of chunk) acc.set(k, v) },
    new Map<number, number>()
  )

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

export async function fetchPrices(typeIds: number[]): Promise<Map<number, number>> {
  return fetchPricesRouted(typeIds)
}

export const queuePriceRefresh = fetchPrices

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

export async function fetchImplantSlots(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const start = performance.now()
  const results = new Map<number, number>()

  try {
    const rawData = await window.electronAPI!.refImplants(typeIds)
    const duration = Math.round(performance.now() - start)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /implants failed', { module: 'RefAPI', error: rawData.error, duration })
      return results
    }

    const parseResult = RefImplantsResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /implants validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
    }

    for (const [idStr, item] of Object.entries(parseResult.data.items)) {
      results.set(Number(idStr), item.slot)
    }

    logger.info('RefAPI /implants', { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration })
  } catch (error) {
    logger.error('RefAPI /implants error', error, { module: 'RefAPI' })
  }

  return results
}
