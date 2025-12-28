import type {
  PriceRecord,
  TrackedRecord,
  TrackedStructureRecord,
} from './regional-market-db'
import type { RegionalTask, StructureTask } from './regional-market-update'

export const CACHE_TTL_MS = 5 * 60 * 1000

export interface TrackedType {
  typeId: number
  regionId: number
}

export interface TrackedStructure {
  characterId: number
  typeIds: Set<number>
  lastFetchAt: number
}

export interface HydratedState {
  pricesByType: Map<number, number>
  pricesByLocation: Map<number, Map<number, number>>
  buyPricesByType: Map<number, number>
  buyPricesByLocation: Map<number, Map<number, number>>
  lastFetchAt: Map<string, number>
  trackedTypes: Map<string, TrackedType>
  trackedStructures: Map<number, TrackedStructure>
}

export function hydrateFromRecords(
  prices: PriceRecord[],
  tracked: TrackedRecord[],
  structures: TrackedStructureRecord[]
): HydratedState {
  const pricesByType = new Map<number, number>()
  const pricesByLocation = new Map<number, Map<number, number>>()
  const buyPricesByType = new Map<number, number>()
  const buyPricesByLocation = new Map<number, Map<number, number>>()
  const lastFetchAt = new Map<string, number>()
  const trackedTypes = new Map<string, TrackedType>()
  const trackedStructures = new Map<number, TrackedStructure>()
  const lastFetchByType = new Map<number, number>()

  for (const record of prices) {
    if (record.lowestPrice !== null)
      pricesByType.set(record.typeId, record.lowestPrice)
    if (record.highestBuyPrice !== null)
      buyPricesByType.set(record.typeId, record.highestBuyPrice)

    if (Object.keys(record.locationPrices).length > 0) {
      const locationMap = new Map<number, number>()
      for (const [locId, price] of Object.entries(record.locationPrices)) {
        locationMap.set(Number(locId), price)
      }
      pricesByLocation.set(record.typeId, locationMap)
    }

    const buyLocPrices = record.buyLocationPrices ?? {}
    if (Object.keys(buyLocPrices).length > 0) {
      const locationMap = new Map<number, number>()
      for (const [locId, price] of Object.entries(buyLocPrices)) {
        locationMap.set(Number(locId), price)
      }
      buyPricesByLocation.set(record.typeId, locationMap)
    }

    lastFetchByType.set(record.typeId, record.lastFetchAt)
  }

  for (const record of tracked) {
    trackedTypes.set(record.key, {
      typeId: record.typeId,
      regionId: record.regionId,
    })
    const fetchTime = lastFetchByType.get(record.typeId)
    if (fetchTime !== undefined) lastFetchAt.set(record.key, fetchTime)
  }

  for (const record of structures) {
    trackedStructures.set(record.structureId, {
      characterId: record.characterId,
      typeIds: new Set(record.typeIds),
      lastFetchAt: record.lastFetchAt,
    })
  }

  return {
    pricesByType,
    pricesByLocation,
    buyPricesByType,
    buyPricesByLocation,
    lastFetchAt,
    trackedTypes,
    trackedStructures,
  }
}

interface CollectTasksInput {
  trackedTypes: Map<string, TrackedType>
  lastFetchAt: Map<string, number>
  trackedStructures: Map<number, TrackedStructure>
}

export function collectTasks(
  state: CollectTasksInput,
  now: number
): {
  regionalTasks: RegionalTask[]
  structureTasks: StructureTask[]
  earliestExpiry: number
} {
  const regionalTasks: RegionalTask[] = []
  const structureTasks: StructureTask[] = []
  let earliestExpiry = Infinity

  for (const [key, { typeId, regionId }] of state.trackedTypes) {
    const lastFetch = state.lastFetchAt.get(key)
    if (!lastFetch || now - lastFetch > CACHE_TTL_MS) {
      regionalTasks.push({ regionId, typeId })
    } else {
      earliestExpiry = Math.min(earliestExpiry, lastFetch + CACHE_TTL_MS)
    }
  }

  for (const [
    structureId,
    { characterId, typeIds, lastFetchAt },
  ] of state.trackedStructures) {
    if (!lastFetchAt || now - lastFetchAt > CACHE_TTL_MS) {
      structureTasks.push({ structureId, characterId, typeIds })
    } else {
      earliestExpiry = Math.min(earliestExpiry, lastFetchAt + CACHE_TTL_MS)
    }
  }

  return { regionalTasks, structureTasks, earliestExpiry }
}

export function cleanupLocationPrices(
  locationMap: Map<number, Map<number, number>>,
  typeMap: Map<number, number>,
  structureIds: Set<number>,
  aggregateFn: (...values: number[]) => number
): void {
  const emptyTypeIds: number[] = []
  for (const [typeId, locMap] of locationMap) {
    for (const structureId of structureIds) locMap.delete(structureId)
    if (locMap.size > 0) {
      typeMap.set(typeId, aggregateFn(...locMap.values()))
    } else {
      typeMap.delete(typeId)
      emptyTypeIds.push(typeId)
    }
  }
  for (const typeId of emptyTypeIds) locationMap.delete(typeId)
}
