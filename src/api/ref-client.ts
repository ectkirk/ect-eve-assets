import { logger } from '@/lib/logger'
import {
  hasType,
  getType,
  saveTypes,
  hasLocation,
  getLocation,
  saveLocations,
  type CachedType,
  type CachedLocation,
} from '@/store/reference-cache'

const isDev = import.meta.env.DEV
const REF_API_BASE = isDev ? '/ref-api/v1' : 'https://ref.edencom.net/api/v1'

export interface RefMarketPrice {
  adjusted?: string | number | null
  average?: string | number | null
  highestBuy?: number | null
  lowestSell?: number | null
}

export interface RefType {
  id: number
  name: string
  groupId?: number | null
  groupName?: string | null
  categoryId?: number | null
  categoryName?: string | null
  volume?: number | null
  packagedVolume?: number | null
  basePrice?: number | null
  marketPrice: RefMarketPrice
}

interface RefTypeBulkResponse {
  items: Record<string, RefType>
}

export type UniverseEntityType = 'region' | 'constellation' | 'system' | 'station' | 'structure'

export interface RefUniverseItem {
  type: UniverseEntityType
  name: string
  solarSystemId?: number
  solarSystemName?: string
  regionId?: number
  regionName?: string
}

interface RefUniverseBulkResponse {
  items: Record<string, RefUniverseItem>
}

async function fetchTypesFromAPI(
  ids: number[],
  market: 'jita' | 'the_forge' = 'jita'
): Promise<Map<number, RefType>> {
  if (ids.length === 0) return new Map()

  const results = new Map<number, RefType>()

  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000)

    try {
      const response = await fetch(`${REF_API_BASE}/types?market=${market}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: chunk }),
      })

      if (!response.ok) {
        logger.warn('RefAPI /types failed', { module: 'RefAPI', status: response.status })
        continue
      }

      const data = (await response.json()) as RefTypeBulkResponse

      for (const [idStr, type] of Object.entries(data.items)) {
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
      const response = await fetch(`${REF_API_BASE}/universe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: chunk }),
      })

      if (!response.ok) {
        logger.warn('RefAPI /universe failed', { module: 'RefAPI', status: response.status })
        continue
      }

      const data = (await response.json()) as RefUniverseBulkResponse

      for (const [idStr, item] of Object.entries(data.items)) {
        results.set(Number(idStr), item)
      }
    } catch (error) {
      logger.error('RefAPI /universe error', error, { module: 'RefAPI' })
    }
  }

  return results
}

export async function resolveTypes(
  typeIds: number[],
  market: 'jita' | 'the_forge' = 'jita'
): Promise<Map<number, CachedType>> {
  const results = new Map<number, CachedType>()
  const uncachedIds: number[] = []

  for (const id of typeIds) {
    if (hasType(id)) {
      results.set(id, getType(id)!)
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
    // This prevents re-fetching them every time
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

export async function resolveLocations(locationIds: number[]): Promise<Map<number, CachedLocation>> {
  const results = new Map<number, CachedLocation>()
  const uncachedIds: number[] = []

  for (const id of locationIds) {
    if (id > 1_000_000_000_000) continue
    if (hasLocation(id)) {
      results.set(id, getLocation(id)!)
    } else {
      uncachedIds.push(id)
    }
  }

  if (uncachedIds.length > 0) {
    logger.debug(`Fetching ${uncachedIds.length} locations from ref API`, { module: 'RefAPI' })
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

export async function fetchPrices(
  typeIds: number[],
  market: 'jita' | 'the_forge' = 'jita'
): Promise<Map<number, number>> {
  const fetched = await fetchTypesFromAPI(typeIds, market)
  const prices = new Map<number, number>()

  for (const [typeId, type] of fetched) {
    const lowestSell = type.marketPrice.lowestSell
    const average = type.marketPrice.average
    const price = lowestSell ?? (typeof average === 'string' ? parseFloat(average) : average) ?? 0
    if (price > 0) {
      prices.set(typeId, price)
    }
  }

  return prices
}
