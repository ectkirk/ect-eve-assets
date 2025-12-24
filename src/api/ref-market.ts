import { logger } from '@/lib/logger'
import { CONTRACT_PRICED_TYPE_IDS } from '@/lib/eve-constants'
import {
  MarketBulkResponseSchema,
  MarketBulkItemSchema,
  MarketJitaResponseSchema,
  RefImplantsResponseSchema,
} from './schemas'
import { z } from 'zod'

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

const CHUNK_CONCURRENCY = 3
const THE_FORGE_REGION_ID = 10000002
const PLEX_TYPE_ID = 44992

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

interface JitaRequestParams {
  typeIds: number[]
  itemIds?: number[]
  contractTypeIds?: number[]
  includePlex?: boolean
}

async function fetchJitaPricesFromAPI(
  params: JitaRequestParams
): Promise<Map<number, number>> {
  const { typeIds, itemIds, contractTypeIds, includePlex } = params

  if (
    typeIds.length === 0 &&
    (!itemIds || itemIds.length === 0) &&
    (!contractTypeIds || contractTypeIds.length === 0) &&
    !includePlex
  ) {
    return new Map()
  }

  const totalStart = performance.now()
  const results = new Map<number, number>()

  const chunks: number[][] = []
  for (let i = 0; i < typeIds.length; i += 1000) {
    chunks.push(typeIds.slice(i, i + 1000))
  }
  if (chunks.length === 0) chunks.push([])

  let firstChunk = true
  for (const chunk of chunks) {
    const chunkStart = performance.now()
    const request: {
      typeIds: number[]
      itemIds?: number[]
      contractTypeIds?: number[]
      includePlex?: boolean
    } = { typeIds: chunk }

    if (firstChunk) {
      if (itemIds && itemIds.length > 0) request.itemIds = itemIds
      if (contractTypeIds && contractTypeIds.length > 0)
        request.contractTypeIds = contractTypeIds
      if (includePlex) request.includePlex = true
    }
    firstChunk = false

    try {
      const rawData = await window.electronAPI!.refMarketJita(request)
      const duration = Math.round(performance.now() - chunkStart)

      const data = validateRefResponse(
        rawData,
        MarketJitaResponseSchema,
        '/market/jita',
        { requested: chunk.length, duration }
      )
      if (!data) continue

      for (const [idStr, price] of Object.entries(data.items)) {
        if (price !== null && price > 0) {
          results.set(Number(idStr), price)
        }
      }

      if (data.mutaItems) {
        for (const [idStr, price] of Object.entries(data.mutaItems)) {
          if (price !== null && price > 0) {
            results.set(Number(idStr), price)
          }
        }
      }

      if (data.contractItems) {
        for (const [idStr, item] of Object.entries(data.contractItems)) {
          if (item.price !== null && item.price > 0) {
            results.set(Number(idStr), item.price)
          }
        }
      }

      if (data.plex?.lowestSell != null && data.plex.lowestSell > 0) {
        results.set(PLEX_TYPE_ID, data.plex.lowestSell)
      }

      logger.info('RefAPI /market/jita', {
        module: 'RefAPI',
        requested: chunk.length,
        mutaRequested: request.itemIds?.length ?? 0,
        contractRequested: request.contractTypeIds?.length ?? 0,
        includePlex: request.includePlex ?? false,
        returned: results.size,
        duration,
      })
    } catch (error) {
      logger.error('RefAPI /market/jita error', error, { module: 'RefAPI' })
    }
  }

  if (typeIds.length > 1000 || (itemIds && itemIds.length > 0)) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/jita total', {
      module: 'RefAPI',
      requested: typeIds.length,
      itemIds: itemIds?.length ?? 0,
      contractTypeIds: contractTypeIds?.length ?? 0,
      returned: results.size,
      duration: totalDuration,
    })
  }

  return results
}

async function fetchPricesConsolidated(
  typeIds: number[],
  itemIds?: number[]
): Promise<Map<number, number>> {
  if (typeIds.length === 0 && (!itemIds || itemIds.length === 0)) {
    return new Map()
  }

  const contractTypeIds = typeIds.filter((id) =>
    CONTRACT_PRICED_TYPE_IDS.has(id)
  )
  const includePlex = typeIds.includes(PLEX_TYPE_ID)

  const results = await fetchJitaPricesFromAPI({
    typeIds,
    itemIds,
    contractTypeIds: contractTypeIds.length > 0 ? contractTypeIds : undefined,
    includePlex,
  })

  logger.info('Prices fetched', {
    module: 'RefAPI',
    total: typeIds.length,
    contracts: contractTypeIds.length,
    plex: includePlex,
    returned: results.size,
  })

  return results
}

export async function fetchPrices(
  typeIds: number[],
  itemIds?: number[]
): Promise<Map<number, number>> {
  return fetchPricesConsolidated(typeIds, itemIds)
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
