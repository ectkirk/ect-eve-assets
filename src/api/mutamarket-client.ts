import { logger } from '@/lib/logger'
import {
  hasAbyssal,
  getAbyssalPrice,
  saveAbyssals,
  type CachedAbyssal,
} from '@/store/reference-cache'
import { MutamarketModuleSchema } from './schemas'
import { z } from 'zod'

const isDev = import.meta.env.DEV
const MUTAMARKET_API_BASE = isDev ? '/mutamarket-api' : 'https://mutamarket.com/api'

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

export function getCachedAbyssalPrice(itemId: number): number | undefined {
  return getAbyssalPrice(itemId)
}

export function hasCachedAbyssalPrice(itemId: number): boolean {
  return hasAbyssal(itemId)
}

async function fetchSingleAbyssalPrice(itemId: number): Promise<{ price: number; persist: boolean } | null> {
  try {
    const response = await fetch(`${MUTAMARKET_API_BASE}/modules/${itemId}`)

    if (!response.ok) {
      if (response.status === 404) {
        return { price: 0, persist: true }
      }
      logger.warn('Mutamarket API failed', { module: 'Mutamarket', status: response.status, itemId })
      return null
    }

    const rawData = await response.json()
    const parseResult = MutamarketModuleSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('Mutamarket response validation failed', undefined, {
        module: 'Mutamarket',
        itemId,
        errors: parseResult.error.issues.slice(0, 3),
      })
      return null
    }

    const price = parseResult.data.estimated_value ?? 0
    logger.debug(`Fetched abyssal price`, { module: 'Mutamarket', itemId, price })

    return { price, persist: true }
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

  for (const itemId of itemIds) {
    if (hasAbyssal(itemId)) {
      const price = getAbyssalPrice(itemId)
      if (price !== undefined && price > 0) {
        results.set(itemId, price)
      }
    } else {
      uncachedIds.push(itemId)
    }
  }

  if (uncachedIds.length === 0) {
    return results
  }

  logger.debug(`Fetching ${uncachedIds.length} abyssal prices from Mutamarket`, { module: 'Mutamarket' })

  const batchSize = 5
  let fetched = 0
  const toSave: CachedAbyssal[] = []

  for (let i = 0; i < uncachedIds.length; i += batchSize) {
    const batch = uncachedIds.slice(i, i + batchSize)

    await Promise.all(
      batch.map(async (itemId) => {
        const result = await fetchSingleAbyssalPrice(itemId)
        if (result !== null) {
          if (result.price > 0) {
            results.set(itemId, result.price)
          }
          if (result.persist) {
            toSave.push({
              id: itemId,
              price: result.price,
              fetchedAt: Date.now(),
            })
          }
        }
        fetched++
        onProgress?.(fetched, uncachedIds.length)
      })
    )
  }

  if (toSave.length > 0) {
    await saveAbyssals(toSave)
    logger.debug(`Cached ${toSave.length} abyssal prices`, { module: 'Mutamarket' })
  }

  logger.debug(`Fetched ${results.size} abyssal prices`, { module: 'Mutamarket' })
  return results
}
