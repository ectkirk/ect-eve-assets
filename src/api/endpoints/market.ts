import { esiClient } from '../esi-client'
import { logger } from '@/lib/logger'
import {
  ESIMarketOrderSchema,
  ESICorporationMarketOrderSchema,
  ESIRegionOrderSchema,
  ESIMarketPriceSchema,
} from '../schemas'
import { z } from 'zod'

export type ESIMarketOrder = z.infer<typeof ESIMarketOrderSchema>
export type ESICorporationMarketOrder = z.infer<typeof ESICorporationMarketOrderSchema>
export type ESIRegionOrder = z.infer<typeof ESIRegionOrderSchema>
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

export const CAPITAL_GROUP_IDS = new Set([
  30, // Titan
  659, // Supercarrier
  547, // Carrier
  485, // Dreadnought
  1538, // Force Auxiliary
  4594, // Lancer Dreadnought
  883, // Capital Industrial Ship (Rorqual)
])

export async function getCharacterOrders(characterId: number): Promise<ESIMarketOrder[]> {
  return esiClient.fetchWithPagination<ESIMarketOrder>(`/characters/${characterId}/orders/`, {
    characterId,
    schema: ESIMarketOrderSchema,
  })
}

export async function getCorporationOrders(
  characterId: number,
  corporationId: number
): Promise<ESICorporationMarketOrder[]> {
  return esiClient.fetchWithPagination<ESICorporationMarketOrder>(
    `/corporations/${corporationId}/orders/`,
    {
      characterId,
      schema: ESICorporationMarketOrderSchema,
    }
  )
}

export async function getMarketPrices(): Promise<ESIMarketPrice[]> {
  return esiClient.fetch<ESIMarketPrice[]>('/markets/prices/', {
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

async function fetchAllRegionOrders(regionId: number): Promise<ESIRegionOrder[]> {
  logger.debug('Fetching regional market orders', { module: 'ESI', regionId })

  return esiClient.fetchWithPagination<ESIRegionOrder>(
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

  logger.debug('Calculated regional prices', { module: 'ESI', types: prices.size })

  return prices
}
