import { logger } from '@/lib/logger'
import { getType } from '@/store/reference-cache'
import {
  MarketBulkResponseSchema,
  MarketBulkItemSchema,
  MarketJitaResponseSchema,
  MarketPlexResponseSchema,
  MarketContractsResponseSchema,
  RefImplantsResponseSchema,
} from './schemas'
import { z } from 'zod'
import { resolveTypes } from './ref-universe-loader'

export type MarketBulkItem = z.infer<typeof MarketBulkItemSchema>

function validateRefResponse<T>(
  rawData: unknown,
  schema: z.ZodType<T>,
  endpoint: string,
  context?: Record<string, unknown>
): T | null {
  if (rawData && typeof rawData === 'object' && 'error' in rawData) {
    logger.warn(`RefAPI ${endpoint} failed`, {
      module: 'RefAPI',
      error: (rawData as { error: string }).error,
      ...context,
    })
    return null
  }

  const parseResult = schema.safeParse(rawData)
  if (!parseResult.success) {
    logger.error(`RefAPI ${endpoint} validation failed`, undefined, {
      module: 'RefAPI',
      errors: parseResult.error.issues.slice(0, 3),
    })
    return null
  }

  return parseResult.data
}

const PLEX_GROUP = 1875
const CONTRACT_GROUPS = new Set([883, 547, 4594, 485, 1538, 659, 30])
const CHUNK_CONCURRENCY = 3
const THE_FORGE_REGION_ID = 10000002

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

      const data = validateRefResponse(
        rawData,
        MarketBulkResponseSchema,
        '/market/bulk',
        { requested: chunk.length, duration }
      )
      if (!data) return results

      const returned = Object.keys(data.items).length
      logger.info('RefAPI /market/bulk', {
        module: 'RefAPI',
        requested: chunk.length,
        returned,
        duration,
      })

      for (const [idStr, item] of Object.entries(data.items)) {
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
    (chunk, acc) => {
      for (const [k, v] of chunk) acc.set(k, v)
    },
    new Map<number, MarketBulkItem>()
  )

  if (typeIds.length > 100) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/bulk total', {
      module: 'RefAPI',
      requested: typeIds.length,
      returned: results.size,
      duration: totalDuration,
    })
  }

  return results
}

async function fetchJitaPricesChunk(
  chunk: number[]
): Promise<Map<number, number>> {
  const results = new Map<number, number>()
  const chunkStart = performance.now()

  try {
    const rawData = await window.electronAPI!.refMarketJita(chunk)
    const duration = Math.round(performance.now() - chunkStart)

    const data = validateRefResponse(
      rawData,
      MarketJitaResponseSchema,
      '/market/jita',
      { requested: chunk.length, duration }
    )
    if (!data) return results

    let returned = 0
    for (const [idStr, price] of Object.entries(data.items)) {
      if (price !== null && price > 0) {
        results.set(Number(idStr), price)
        returned++
      }
    }
    logger.info('RefAPI /market/jita', {
      module: 'RefAPI',
      requested: chunk.length,
      returned,
      duration,
    })
  } catch (error) {
    logger.error('RefAPI /market/jita error', error, { module: 'RefAPI' })
  }

  return results
}

async function fetchJitaPricesFromAPI(
  typeIds: number[]
): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    typeIds,
    1000,
    fetchJitaPricesChunk,
    (chunk, acc) => {
      for (const [k, v] of chunk) acc.set(k, v)
    },
    new Map<number, number>()
  )

  if (typeIds.length > 1000) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/jita total', {
      module: 'RefAPI',
      requested: typeIds.length,
      returned: results.size,
      duration: totalDuration,
    })
  }

  return results
}

async function fetchPlexPriceFromAPI(): Promise<number | null> {
  const start = performance.now()
  try {
    const rawData = await window.electronAPI!.refMarketPlex()
    const duration = Math.round(performance.now() - start)

    const data = validateRefResponse(
      rawData,
      MarketPlexResponseSchema,
      '/market/plex',
      { duration }
    )
    if (!data) return null

    logger.info('RefAPI /market/plex', { module: 'RefAPI', duration })
    return data.lowestSell
  } catch (error) {
    logger.error('RefAPI /market/plex error', error, { module: 'RefAPI' })
    return null
  }
}

async function fetchContractPricesChunk(
  chunk: number[]
): Promise<Map<number, number>> {
  const results = new Map<number, number>()
  const chunkStart = performance.now()

  try {
    const rawData = await window.electronAPI!.refMarketContracts(chunk)
    const duration = Math.round(performance.now() - chunkStart)

    const data = validateRefResponse(
      rawData,
      MarketContractsResponseSchema,
      '/market/contracts',
      { requested: chunk.length, duration }
    )
    if (!data) return results

    let returned = 0
    for (const [idStr, item] of Object.entries(data.items)) {
      if (item.price !== null && item.price > 0 && item.hasSufficientData) {
        results.set(Number(idStr), item.price)
        returned++
      }
    }
    logger.info('RefAPI /market/contracts', {
      module: 'RefAPI',
      requested: chunk.length,
      returned,
      duration,
    })
  } catch (error) {
    logger.error('RefAPI /market/contracts error', error, { module: 'RefAPI' })
  }

  return results
}

async function fetchContractPricesFromAPI(
  typeIds: number[]
): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    typeIds,
    100,
    fetchContractPricesChunk,
    (chunk, acc) => {
      for (const [k, v] of chunk) acc.set(k, v)
    },
    new Map<number, number>()
  )

  if (typeIds.length > 100) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/contracts total', {
      module: 'RefAPI',
      requested: typeIds.length,
      returned: results.size,
      duration: totalDuration,
    })
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

async function fetchPricesRouted(
  typeIds: number[]
): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  await resolveTypes(typeIds)

  const { plexIds, contractIds } = categorizeTypeIdsByEndpoint(typeIds)
  const results = new Map<number, number>()

  const jitaPrices = await fetchJitaPricesFromAPI(typeIds)
  for (const [id, price] of jitaPrices) {
    results.set(id, price)
  }

  const enhancePromises: Promise<void>[] = []

  if (plexIds.length > 0) {
    enhancePromises.push(
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
    enhancePromises.push(
      fetchContractPricesFromAPI(contractIds).then((prices) => {
        for (const [id, price] of prices) {
          results.set(id, price)
        }
      })
    )
  }

  if (enhancePromises.length > 0) {
    await Promise.all(enhancePromises)
  }

  logger.info('Prices fetched', {
    module: 'RefAPI',
    total: typeIds.length,
    jita: jitaPrices.size,
    plex: plexIds.length,
    contracts: contractIds.length,
    returned: results.size,
  })

  return results
}

export async function fetchPrices(
  typeIds: number[]
): Promise<Map<number, number>> {
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
  const fetched = await fetchMarketFromAPI(typeIds, {
    avg: true,
    buy: true,
    jita: true,
  })
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

export async function fetchImplantSlots(
  typeIds: number[]
): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const start = performance.now()
  const results = new Map<number, number>()

  try {
    const rawData = await window.electronAPI!.refImplants(typeIds)
    const duration = Math.round(performance.now() - start)

    const data = validateRefResponse(
      rawData,
      RefImplantsResponseSchema,
      '/implants',
      { duration }
    )
    if (!data) return results

    for (const [idStr, item] of Object.entries(data.items)) {
      results.set(Number(idStr), item.slot)
    }

    logger.info('RefAPI /implants', {
      module: 'RefAPI',
      requested: typeIds.length,
      returned: results.size,
      duration,
    })
  } catch (error) {
    logger.error('RefAPI /implants error', error, { module: 'RefAPI' })
  }

  return results
}
