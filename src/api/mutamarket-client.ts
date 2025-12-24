import { logger } from '@/lib/logger'
import { usePriceStore } from '@/store/price-store'
import { MutamarketModuleSchema } from './schemas'
import { z } from 'zod'

export type MutamarketModule = z.infer<typeof MutamarketModuleSchema>

const ABYSSAL_TYPE_IDS = new Set([
  56305, 47757, 47753, 47749, 56306, 47745, 47408, 47740, 52230, 49738, 52227,
  90483, 90498, 49734, 90593, 90529, 49730, 49726, 90524, 90502, 49722, 90460,
  90474, 90487, 90467, 56313, 47702, 90493, 78621, 47736, 47732, 56308, 56310,
  56307, 56312, 56311, 56309, 47832, 48427, 56304, 56303, 47846, 47838, 47820,
  47777, 48439, 84434, 84436, 84435, 84437, 47789, 47808, 47844, 47836, 47817,
  47773, 48435, 84438, 47828, 48423, 84440, 84439, 84441, 47785, 47804, 60482,
  60483, 47842, 47812, 47769, 48431, 84442, 47824, 48419, 84444, 84443, 84445,
  47781, 47800, 47840, 47793, 60480, 60478, 60479, 90622, 90621, 90618, 90614,
  60481,
])

export function isAbyssalTypeId(typeId: number): boolean {
  return ABYSSAL_TYPE_IDS.has(typeId)
}

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
