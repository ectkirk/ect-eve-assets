import { logger } from '@/lib/logger'
import {
  hasAbyssal,
  getAbyssalPrice,
  saveAbyssals,
  type CachedAbyssal,
} from '@/store/reference-cache'

const isDev = import.meta.env.DEV
const MUTAMARKET_API_BASE = isDev ? '/mutamarket-api' : 'https://mutamarket.com/api'

export interface MutamarketModule {
  id: number
  type: {
    id: number
    name: string
  }
  source_type: {
    id: number
    name: string
    meta_group?: string
    meta_group_id?: number
    published?: boolean
  }
  mutaplasmid?: {
    id: number
    name: string
  }
  estimated_value?: number
  estimated_value_updated_at?: string
  slug?: string
  contract?: {
    id: number
    type: string
    price: number
  }
}

// Track items we've tried but got no result (not in mutamarket)
// This is in-memory only since we don't want to persist "not found" entries
const notFoundCache = new Set<number>()

export function isAbyssalType(typeName: string): boolean {
  return typeName.toLowerCase().includes('abyssal')
}

export function getCachedAbyssalPrice(itemId: number): number | undefined {
  return getAbyssalPrice(itemId)
}

export function hasCachedAbyssalPrice(itemId: number): boolean {
  return hasAbyssal(itemId) || notFoundCache.has(itemId)
}

async function fetchSingleAbyssalPrice(itemId: number): Promise<number | null> {
  try {
    const response = await fetch(`${MUTAMARKET_API_BASE}/modules/${itemId}`)

    if (!response.ok) {
      if (response.status === 404) {
        notFoundCache.add(itemId)
        return null
      }
      logger.warn('Mutamarket API failed', { module: 'Mutamarket', status: response.status, itemId })
      return null
    }

    const data = (await response.json()) as MutamarketModule
    const price = data.estimated_value ?? null

    logger.debug(`Fetched abyssal price`, { module: 'Mutamarket', itemId, price })

    return price
  } catch (error) {
    logger.error('Mutamarket API error', error, { module: 'Mutamarket', itemId })
    return null
  }
}

export async function fetchAbyssalPrices(
  itemIds: number[],
  onProgress?: (fetched: number, total: number) => void
): Promise<Map<number, number>> {
  const results = new Map<number, number>()
  const uncachedIds: number[] = []

  // Check persistent cache first
  for (const itemId of itemIds) {
    if (hasAbyssal(itemId)) {
      const price = getAbyssalPrice(itemId)
      if (price !== undefined) {
        results.set(itemId, price)
      }
    } else if (!notFoundCache.has(itemId)) {
      uncachedIds.push(itemId)
    }
  }

  if (uncachedIds.length === 0) {
    return results
  }

  logger.debug(`Fetching ${uncachedIds.length} abyssal prices from Mutamarket`, { module: 'Mutamarket' })

  // Fetch in batches to avoid overwhelming the API
  const batchSize = 5
  let fetched = 0
  const toSave: CachedAbyssal[] = []

  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize)

    await Promise.all(
      batch.map(async (itemId) => {
        const price = await fetchSingleAbyssalPrice(itemId)
        if (price !== null) {
          results.set(itemId, price)
          toSave.push({
            id: itemId,
            price,
            fetchedAt: Date.now(),
          })
        }
        fetched++
        onProgress?.(fetched, uncachedIds.length)
      })
    )
  }

  // Persist to IndexedDB
  if (toSave.length > 0) {
    await saveAbyssals(toSave)
    logger.debug(`Cached ${toSave.length} abyssal prices`, { module: 'Mutamarket' })
  }

  logger.debug(`Fetched ${results.size} abyssal prices`, { module: 'Mutamarket' })
  return results
}
