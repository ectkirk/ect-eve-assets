import { logger } from '@/lib/logger'
import { usePriceStore, isAbyssalTypeId } from '@/store/price-store'
import { MutamarketModuleSchema } from './schemas'
import { z } from 'zod'

export { isAbyssalTypeId }

export type MutamarketModule = z.infer<typeof MutamarketModuleSchema>

export function getMutamarketUrl(typeName: string, itemId: number): string {
  const slug = typeName.toLowerCase().replace(/\s+/g, '-')
  return `https://mutamarket.com/modules/${slug}-${itemId}`
}

export function getCachedAbyssalPrice(itemId: number): number | undefined {
  return usePriceStore.getState().getAbyssalPrice(itemId)
}

export function getValidAbyssalPrice(itemId: number): number | undefined {
  const price = usePriceStore.getState().getAbyssalPrice(itemId)
  return price !== undefined && price > 0 ? price : undefined
}

const MAX_RETRIES = 2
const RETRY_DELAYS = [500, 1500]
const REQUEST_DELAY_MS = 100

export interface AbyssalItem {
  itemId: number
  typeId: number
}

interface QueuedRequest {
  item: AbyssalItem
  resolve: (result: { price: number; persist: boolean } | null) => void
}

const requestQueue: QueuedRequest[] = []
let queueProcessing = false
let lastRequestTime = 0

async function processQueue(): Promise<void> {
  if (queueProcessing) return
  queueProcessing = true

  while (requestQueue.length > 0) {
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    if (timeSinceLastRequest < REQUEST_DELAY_MS) {
      await new Promise((r) =>
        setTimeout(r, REQUEST_DELAY_MS - timeSinceLastRequest)
      )
    }
    lastRequestTime = Date.now()

    const request = requestQueue.shift()
    if (request) {
      const result = await fetchSingleAbyssalPriceInternal(request.item)
      request.resolve(result)
    }
  }

  queueProcessing = false
}

function queueAbyssalRequest(
  item: AbyssalItem
): Promise<{ price: number; persist: boolean } | null> {
  return new Promise((resolve) => {
    requestQueue.push({ item, resolve })
    processQueue()
  })
}

async function fetchSingleAbyssalPriceInternal(
  item: AbyssalItem,
  retryCount = 0
): Promise<{ price: number; persist: boolean } | null> {
  const { itemId, typeId } = item
  try {
    const rawData = await window.electronAPI!.mutamarketModule(itemId, typeId)

    if (rawData.error) {
      if (rawData.status === 404) {
        return { price: -1, persist: true }
      }
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount] ?? 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
        return fetchSingleAbyssalPriceInternal(item, retryCount + 1)
      }
      logger.warn('Mutamarket API failed', {
        module: 'Mutamarket',
        error: rawData.error,
        itemId,
      })
      return null
    }

    const parseResult = MutamarketModuleSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.warn('Mutamarket response validation failed', {
        module: 'Mutamarket',
        itemId,
        errors: parseResult.error.issues.slice(0, 3),
      })
      return null
    }

    const price = parseResult.data.estimated_value ?? -1
    return { price, persist: true }
  } catch {
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount] ?? 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
      return fetchSingleAbyssalPriceInternal(item, retryCount + 1)
    }
    return null
  }
}

export async function fetchAbyssalPrices(
  items: AbyssalItem[],
  onProgress?: (fetched: number, total: number) => void
): Promise<Map<number, number>> {
  const priceStore = usePriceStore.getState()
  const results = new Map<number, number>()
  const uncachedItems: AbyssalItem[] = []

  for (const item of items) {
    const price = priceStore.getAbyssalPrice(item.itemId)
    if (price !== undefined && price > 0) {
      results.set(item.itemId, price)
    } else if (price === undefined || price === 0) {
      uncachedItems.push(item)
    }
  }

  if (uncachedItems.length === 0) {
    return results
  }

  let fetched = 0
  const toSave: Array<{ itemId: number; price: number }> = []

  for (const item of uncachedItems) {
    const result = await queueAbyssalRequest(item)
    if (result !== null) {
      if (result.price > 0) {
        results.set(item.itemId, result.price)
      }
      if (result.persist) {
        toSave.push({ itemId: item.itemId, price: result.price })
      }
    }
    fetched++
    onProgress?.(fetched, uncachedItems.length)
  }

  if (toSave.length > 0) {
    await usePriceStore.getState().setAbyssalPrices(toSave)
  }

  return results
}
