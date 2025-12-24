import { esi } from '../esi'
import {
  ESIMarketOrderSchema,
  ESICorporationMarketOrderSchema,
  ESIRegionOrderSchema,
  ESIStructureOrderSchema,
  ESIMarketPriceSchema,
} from '../schemas'
import { z } from 'zod'

export type ESIMarketOrder = z.infer<typeof ESIMarketOrderSchema>
export type ESICorporationMarketOrder = z.infer<
  typeof ESICorporationMarketOrderSchema
>
export type ESIRegionOrder = z.infer<typeof ESIRegionOrderSchema>
export type ESIStructureOrder = z.infer<typeof ESIStructureOrderSchema>
export type ESIMarketPrice = z.infer<typeof ESIMarketPriceSchema>

export interface PriceData {
  sellMin: number
  sellMax: number
  sellAvg: number
  sellMedian: number
  buyMin: number
  buyMax: number
  buyAvg: number
  buyMedian: number
}

export const EMPTY_PRICE_DATA: PriceData = {
  sellMin: 0,
  sellMax: 0,
  sellAvg: 0,
  sellMedian: 0,
  buyMin: 0,
  buyMax: 0,
  buyAvg: 0,
  buyMedian: 0,
}

export const DEFAULT_REGION_ID = 10000002

export async function getCharacterOrders(
  characterId: number
): Promise<ESIMarketOrder[]> {
  return esi.fetchPaginated<ESIMarketOrder>(
    `/characters/${characterId}/orders/`,
    {
      characterId,
      schema: ESIMarketOrderSchema,
    }
  )
}

export async function getCorporationOrders(
  characterId: number,
  corporationId: number
): Promise<ESICorporationMarketOrder[]> {
  return esi.fetchPaginated<ESICorporationMarketOrder>(
    `/corporations/${corporationId}/orders/`,
    {
      characterId,
      schema: ESICorporationMarketOrderSchema,
    }
  )
}

export async function getMarketPrices(): Promise<ESIMarketPrice[]> {
  return esi.fetch<ESIMarketPrice[]>('/markets/prices/', {
    requiresAuth: false,
    schema: z.array(ESIMarketPriceSchema),
  })
}

interface Order {
  price: number
  volume: number
}

function weightedMean(orders: Order[]): number {
  if (orders.length === 0) return 0
  let sumPriceVolume = 0
  let sumVolume = 0
  for (const o of orders) {
    sumPriceVolume += o.price * o.volume
    sumVolume += o.volume
  }
  return sumVolume > 0 ? sumPriceVolume / sumVolume : 0
}

function weightedMedian(orders: Order[]): number {
  if (orders.length === 0) return 0
  let totalVolume = 0
  for (const o of orders) {
    totalVolume += o.volume
  }
  const halfVolume = totalVolume / 2
  let cumulative = 0
  for (const o of orders) {
    cumulative += o.volume
    if (cumulative >= halfVolume) {
      return o.price
    }
  }
  const lastOrder = orders[orders.length - 1]
  return lastOrder ? lastOrder.price : 0
}

function calculatePriceData(orders: ESIRegionOrder[]): PriceData {
  if (orders.length === 0) return EMPTY_PRICE_DATA

  const sells: Order[] = []
  const buys: Order[] = []

  for (const order of orders) {
    const o = { price: order.price, volume: order.volume_remain }
    if (order.is_buy_order) {
      buys.push(o)
    } else {
      sells.push(o)
    }
  }

  sells.sort((a, b) => a.price - b.price)
  buys.sort((a, b) => b.price - a.price)

  const data: PriceData = { ...EMPTY_PRICE_DATA }

  if (sells.length > 0) {
    const first = sells[0]
    const last = sells[sells.length - 1]
    if (first && last) {
      data.sellMin = first.price
      data.sellMax = last.price
      data.sellAvg = weightedMean(sells)
      data.sellMedian = weightedMedian(sells)
    }
  }

  if (buys.length > 0) {
    const first = buys[0]
    const last = buys[buys.length - 1]
    if (first && last) {
      data.buyMax = first.price
      data.buyMin = last.price
      data.buyAvg = weightedMean(buys)
      data.buyMedian = weightedMedian(buys)
    }
  }

  return data
}

async function fetchAllRegionOrders(
  regionId: number
): Promise<ESIRegionOrder[]> {
  return esi.fetchPaginated<ESIRegionOrder>(
    `/markets/${regionId}/orders/?order_type=all`,
    { requiresAuth: false, schema: ESIRegionOrderSchema }
  )
}

export async function getRegionalMarketPrices(
  regionId: number = DEFAULT_REGION_ID
): Promise<Map<number, PriceData>> {
  const allOrders = await fetchAllRegionOrders(regionId)

  const ordersByType = new Map<number, ESIRegionOrder[]>()
  for (const order of allOrders) {
    const typeOrders = ordersByType.get(order.type_id)
    if (typeOrders) {
      typeOrders.push(order)
    } else {
      ordersByType.set(order.type_id, [order])
    }
  }

  const prices = new Map<number, PriceData>()
  for (const [typeId, orders] of ordersByType) {
    prices.set(typeId, calculatePriceData(orders))
  }

  return prices
}

export async function getRegionalOrders(
  regionId: number,
  typeId: number,
  orderType: 'sell' | 'buy'
): Promise<ESIRegionOrder[]> {
  return esi.fetchPaginated<ESIRegionOrder>(
    `/markets/${regionId}/orders/?order_type=${orderType}&type_id=${typeId}`,
    { requiresAuth: false, schema: ESIRegionOrderSchema }
  )
}

export async function getStructureOrders(
  structureId: number,
  characterId: number
): Promise<ESIStructureOrder[]> {
  return esi.fetchPaginated<ESIStructureOrder>(
    `/markets/structures/${structureId}/`,
    { characterId, schema: ESIStructureOrderSchema }
  )
}
