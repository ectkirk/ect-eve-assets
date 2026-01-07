import { getRegionalOrders, getStructureOrders } from '@/api/endpoints/market'
import { logger } from '@/lib/logger'
import { getErrorMessage } from '@/lib/errors'
import { chunkArray } from '@/lib/utils'
import {
  savePricesToDB,
  saveStructuresToDB,
  type PriceRecord,
  type TrackedStructureRecord,
} from './regional-market-db'

const PARALLEL_LIMIT = 10

export function cacheKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`
}

interface PriceUpdateContext {
  sellPricesByLocation: Map<number, Map<number, number>>
  sellPricesByType: Map<number, number>
  buyPricesByLocation: Map<number, Map<number, number>>
  buyPricesByType: Map<number, number>
  priceUpdates: Map<number, PriceRecord>
}

function updateLocationPrice(
  ctx: PriceUpdateContext,
  typeId: number,
  locationId: number,
  price: number,
  isBuyOrder: boolean,
  fetchTime: number
): void {
  const pricesByLocation = isBuyOrder
    ? ctx.buyPricesByLocation
    : ctx.sellPricesByLocation
  const pricesByType = isBuyOrder ? ctx.buyPricesByType : ctx.sellPricesByType
  const aggregateFn = isBuyOrder ? Math.max : Math.min

  let typeLocationMap = pricesByLocation.get(typeId)
  if (!typeLocationMap) {
    typeLocationMap = new Map()
    pricesByLocation.set(typeId, typeLocationMap)
  }
  typeLocationMap.set(locationId, price)
  pricesByType.set(typeId, aggregateFn(...typeLocationMap.values()))

  const existing = ctx.priceUpdates.get(typeId)
  const sellLocationMap = ctx.sellPricesByLocation.get(typeId)
  const buyLocationMap = ctx.buyPricesByLocation.get(typeId)

  const locationPricesObj: Record<number, number> =
    existing?.locationPrices ?? {}
  const buyLocationPricesObj: Record<number, number> =
    existing?.buyLocationPrices ?? {}

  if (sellLocationMap) {
    for (const [locId, p] of sellLocationMap) locationPricesObj[locId] = p
  }
  if (buyLocationMap) {
    for (const [locId, p] of buyLocationMap) buyLocationPricesObj[locId] = p
  }

  ctx.priceUpdates.set(typeId, {
    typeId,
    lowestPrice: ctx.sellPricesByType.get(typeId) ?? null,
    highestBuyPrice: ctx.buyPricesByType.get(typeId) ?? null,
    locationPrices: locationPricesObj,
    buyLocationPrices: buyLocationPricesObj,
    lastFetchAt: fetchTime,
  })
}

export interface RegionalTask {
  regionId: number
  typeId: number
}

export interface StructureTask {
  structureId: number
  characterId: number
  typeIds: Set<number>
}

export interface UpdateResult {
  sellPricesByType: Map<number, number>
  sellPricesByLocation: Map<number, Map<number, number>>
  buyPricesByType: Map<number, number>
  buyPricesByLocation: Map<number, Map<number, number>>
  lastFetchAt: Map<string, number>
  trackedStructures: Map<
    number,
    { characterId: number; typeIds: Set<number>; lastFetchAt: number }
  >
}

interface UpdateInput {
  regionalTasks: RegionalTask[]
  structureTasks: StructureTask[]
  currentState: {
    pricesByType: Map<number, number>
    pricesByLocation: Map<number, Map<number, number>>
    buyPricesByType: Map<number, number>
    buyPricesByLocation: Map<number, Map<number, number>>
    lastFetchAt: Map<string, number>
    trackedStructures: Map<
      number,
      { characterId: number; typeIds: Set<number>; lastFetchAt: number }
    >
  }
}

export function deepClonePricesByLocation(
  original: Map<number, Map<number, number>>
): Map<number, Map<number, number>> {
  const clone = new Map<number, Map<number, number>>()
  for (const [typeId, locationMap] of original) {
    clone.set(typeId, new Map(locationMap))
  }
  return clone
}

async function processRegionalBatch(
  batch: RegionalTask[],
  ctx: PriceUpdateContext,
  lastFetchAt: Map<string, number>
): Promise<void> {
  await Promise.all(
    batch.map(async ({ regionId, typeId }) => {
      try {
        const [sellOrders, buyOrders] = await Promise.all([
          getRegionalOrders(regionId, typeId, 'sell'),
          getRegionalOrders(regionId, typeId, 'buy'),
        ])
        const key = cacheKey(regionId, typeId)
        const fetchTime = Date.now()
        lastFetchAt.set(key, fetchTime)

        const lowestByLocation = new Map<number, number>()
        for (const order of sellOrders) {
          const current = lowestByLocation.get(order.location_id)
          if (!current || order.price < current) {
            lowestByLocation.set(order.location_id, order.price)
          }
        }

        const highestByLocation = new Map<number, number>()
        for (const order of buyOrders) {
          const current = highestByLocation.get(order.location_id)
          if (!current || order.price > current) {
            highestByLocation.set(order.location_id, order.price)
          }
        }

        for (const [locationId, price] of lowestByLocation) {
          updateLocationPrice(ctx, typeId, locationId, price, false, fetchTime)
        }
        for (const [locationId, price] of highestByLocation) {
          updateLocationPrice(ctx, typeId, locationId, price, true, fetchTime)
        }
      } catch (err) {
        logger.warn('Failed to fetch regional orders', {
          module: 'RegionalMarketStore',
          regionId,
          typeId,
          error: getErrorMessage(err),
        })
      }
    })
  )
}

async function processStructure(
  task: StructureTask,
  ctx: PriceUpdateContext,
  trackedStructures: Map<
    number,
    { characterId: number; typeIds: Set<number>; lastFetchAt: number }
  >,
  structureUpdates: TrackedStructureRecord[]
): Promise<void> {
  const { structureId, characterId, typeIds } = task
  try {
    const orders = await getStructureOrders(structureId, characterId)
    const fetchTime = Date.now()

    const lowestByType = new Map<number, number>()
    const highestByType = new Map<number, number>()
    for (const order of orders) {
      if (!typeIds.has(order.type_id)) continue

      if (order.is_buy_order) {
        const current = highestByType.get(order.type_id)
        if (!current || order.price > current) {
          highestByType.set(order.type_id, order.price)
        }
      } else {
        const current = lowestByType.get(order.type_id)
        if (!current || order.price < current) {
          lowestByType.set(order.type_id, order.price)
        }
      }
    }

    for (const [typeId, price] of lowestByType) {
      updateLocationPrice(ctx, typeId, structureId, price, false, fetchTime)
    }
    for (const [typeId, price] of highestByType) {
      updateLocationPrice(ctx, typeId, structureId, price, true, fetchTime)
    }

    const existing = trackedStructures.get(structureId)
    if (existing) {
      trackedStructures.set(structureId, {
        ...existing,
        lastFetchAt: fetchTime,
      })
      structureUpdates.push({
        structureId,
        characterId,
        typeIds: Array.from(existing.typeIds),
        lastFetchAt: fetchTime,
      })
    }
  } catch (err) {
    logger.warn('Failed to fetch structure orders', {
      module: 'RegionalMarketStore',
      structureId,
      error: getErrorMessage(err),
    })
  }
}

export async function executeUpdate(input: UpdateInput): Promise<UpdateResult> {
  const { regionalTasks, structureTasks, currentState } = input

  const sellPricesByType = new Map(currentState.pricesByType)
  const sellPricesByLocation = deepClonePricesByLocation(
    currentState.pricesByLocation
  )
  const buyPricesByType = new Map(currentState.buyPricesByType)
  const buyPricesByLocation = deepClonePricesByLocation(
    currentState.buyPricesByLocation
  )
  const lastFetchAt = new Map(currentState.lastFetchAt)
  const trackedStructures = new Map(currentState.trackedStructures)

  const priceUpdates = new Map<number, PriceRecord>()
  const structureUpdates: TrackedStructureRecord[] = []

  const ctx: PriceUpdateContext = {
    sellPricesByLocation,
    sellPricesByType,
    buyPricesByLocation,
    buyPricesByType,
    priceUpdates,
  }

  for (const batch of chunkArray(regionalTasks, PARALLEL_LIMIT)) {
    await processRegionalBatch(batch, ctx, lastFetchAt)
  }

  for (const batch of chunkArray(structureTasks, PARALLEL_LIMIT)) {
    await Promise.all(
      batch.map((task) =>
        processStructure(task, ctx, trackedStructures, structureUpdates)
      )
    )
  }

  await savePricesToDB(Array.from(priceUpdates.values()))
  await saveStructuresToDB(structureUpdates)

  logger.info('Regional prices updated', {
    module: 'RegionalMarketStore',
    regionalTasks: regionalTasks.length,
    structureTasks: structureTasks.length,
    updated: priceUpdates.size,
  })

  return {
    sellPricesByType,
    sellPricesByLocation,
    buyPricesByType,
    buyPricesByLocation,
    lastFetchAt,
    trackedStructures,
  }
}
