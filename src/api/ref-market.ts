import { logger } from '@/lib/logger'
import { CONTRACT_PRICED_TYPE_IDS } from '@/lib/eve-constants'
import { MarketJitaResponseSchema } from './schemas'
import { z } from 'zod'
import { isTypePublished, isTypeMarketable } from '@/store/reference-cache'

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

const PLEX_TYPE_ID = 44992
const EXCLUDED_TYPE_IDS = new Set([670, 33328]) // Capsules - no market price

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
      typeIds?: number[]
      itemIds?: number[]
      contractTypeIds?: number[]
      includePlex?: boolean
    } = {}

    if (chunk.length > 0) {
      request.typeIds = chunk
    }

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

      if (data.items) {
        for (const [idStr, price] of Object.entries(data.items)) {
          if (price !== null && price > 0) {
            results.set(Number(idStr), price)
          }
        }
      }

      if (data.mutaItems) {
        for (const [idStr, price] of Object.entries(data.mutaItems)) {
          const id = Number(idStr)
          results.set(id, price !== null && price > 0 ? price : 0)
        }
      }

      if (data.contractItems) {
        for (const [idStr, item] of Object.entries(data.contractItems)) {
          if (item && item.price !== null && item.price > 0) {
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

  const pricableTypeIds = typeIds.filter(
    (id) =>
      isTypePublished(id) && isTypeMarketable(id) && !EXCLUDED_TYPE_IDS.has(id)
  )

  const contractTypeIds = pricableTypeIds.filter((id) =>
    CONTRACT_PRICED_TYPE_IDS.has(id)
  )
  const includePlex = pricableTypeIds.includes(PLEX_TYPE_ID)

  const results = await fetchJitaPricesFromAPI({
    typeIds: pricableTypeIds,
    itemIds,
    contractTypeIds: contractTypeIds.length > 0 ? contractTypeIds : undefined,
    includePlex,
  })

  const missingTypeIds = pricableTypeIds.filter((id) => !results.has(id))
  if (missingTypeIds.length > 0 && missingTypeIds.length <= 10) {
    logger.info('Prices fetched (some missing)', {
      module: 'RefAPI',
      total: pricableTypeIds.length,
      returned: results.size,
      missingTypeIds,
    })
  } else {
    logger.info('Prices fetched', {
      module: 'RefAPI',
      total: pricableTypeIds.length,
      contracts: contractTypeIds.length,
      plex: includePlex,
      returned: results.size,
    })
  }

  return results
}

export async function fetchPrices(
  typeIds: number[],
  itemIds?: number[]
): Promise<Map<number, number>> {
  return fetchPricesConsolidated(typeIds, itemIds)
}

export const queuePriceRefresh = fetchPrices
