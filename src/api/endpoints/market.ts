import { esiClient } from '../client'

export interface ESIMarketOrder {
  duration: number
  escrow?: number
  is_buy_order: boolean
  is_corporation: boolean
  issued: string
  location_id: number
  min_volume?: number
  order_id: number
  price: number
  range: string
  region_id: number
  type_id: number
  volume_remain: number
  volume_total: number
}

// Regional market order from /markets/{region_id}/orders/
export interface ESIRegionOrder {
  duration: number
  is_buy_order: boolean
  issued: string
  location_id: number
  min_volume: number
  order_id: number
  price: number
  range: string
  system_id: number
  type_id: number
  volume_remain: number
  volume_total: number
}

export interface ESIMarketPrice {
  adjusted_price?: number
  average_price?: number
  type_id: number
}

// Calculated price data from regional market orders
// This is what Java uses for item valuation (not ESI /markets/prices/)
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

// The Forge region (Jita) - default for price lookups
export const DEFAULT_REGION_ID = 10000002

// Capital ship group IDs - these are sold via contracts, not market
// Freighters (513) and Jump Freighters (902) are NOT capitals
export const CAPITAL_GROUP_IDS = new Set([
  30,    // Titan
  659,   // Supercarrier
  547,   // Carrier
  485,   // Dreadnought
  1538,  // Force Auxiliary
  4594,  // Lancer Dreadnought
  883,   // Capital Industrial Ship (Rorqual)
])

export async function getCharacterOrders(
  characterId: number
): Promise<ESIMarketOrder[]> {
  return esiClient.fetch<ESIMarketOrder[]>(
    `/characters/${characterId}/orders/`
  )
}

// Fetches average market prices - public endpoint, no auth required
// NOTE: This endpoint has adjusted_price (for industry) and average_price (global)
// For asset valuation, use getRegionalMarketPrices() instead which provides sellMin
export async function getMarketPrices(): Promise<ESIMarketPrice[]> {
  const response = await fetch(
    'https://esi.evetech.net/latest/markets/prices/?datasource=tranquility',
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
  if (!response.ok) {
    throw new Error(`Failed to fetch market prices: ${response.status}`)
  }
  return response.json()
}

// Helper type for price calculation
interface Order {
  price: number
  volume: number
}

// Calculate volume-weighted mean price
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

// Calculate price statistics from raw market orders for a single type
function calculatePriceData(orders: ESIRegionOrder[]): PriceData {
  if (orders.length === 0) return EMPTY_PRICE_DATA

  // Separate buy and sell orders
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

  // Sort sells ascending (lowest first - best price for buyers)
  sells.sort((a, b) => a.price - b.price)
  // Sort buys descending (highest first - best price for sellers)
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

// Fetch all orders for a region with pagination
async function fetchAllRegionOrders(regionId: number): Promise<ESIRegionOrder[]> {
  const baseUrl = `https://esi.evetech.net/latest/markets/${regionId}/orders/?datasource=tranquility&order_type=all`

  // First request to get total pages
  const firstResponse = await fetch(`${baseUrl}&page=1`)
  if (!firstResponse.ok) {
    throw new Error(`Failed to fetch market orders: ${firstResponse.status}`)
  }

  const totalPages = parseInt(firstResponse.headers.get('X-Pages') || '1', 10)
  const firstPageOrders: ESIRegionOrder[] = await firstResponse.json()

  if (totalPages === 1) {
    return firstPageOrders
  }

  // Fetch remaining pages in parallel (batches of 20 to avoid rate limits)
  const allOrders = [...firstPageOrders]
  const batchSize = 20

  for (let startPage = 2; startPage <= totalPages; startPage += batchSize) {
    const endPage = Math.min(startPage + batchSize - 1, totalPages)
    const pagePromises: Promise<ESIRegionOrder[]>[] = []

    for (let page = startPage; page <= endPage; page++) {
      pagePromises.push(
        fetch(`${baseUrl}&page=${page}`)
          .then((res) => {
            if (!res.ok) throw new Error(`Page ${page} failed: ${res.status}`)
            return res.json()
          })
      )
    }

    const pageResults = await Promise.all(pagePromises)
    for (const orders of pageResults) {
      allOrders.push(...orders)
    }
  }

  return allOrders
}

// Get regional market prices calculated from actual market orders
// This is what the Java codebase uses for asset valuation
// Default region is The Forge (Jita) - region 10000002
export async function getRegionalMarketPrices(
  regionId: number = DEFAULT_REGION_ID
): Promise<Map<number, PriceData>> {
  const allOrders = await fetchAllRegionOrders(regionId)

  // Group orders by typeId
  const ordersByType = new Map<number, ESIRegionOrder[]>()
  for (const order of allOrders) {
    const typeOrders = ordersByType.get(order.type_id)
    if (typeOrders) {
      typeOrders.push(order)
    } else {
      ordersByType.set(order.type_id, [order])
    }
  }

  // Calculate prices for each type
  const prices = new Map<number, PriceData>()
  for (const [typeId, orders] of ordersByType) {
    prices.set(typeId, calculatePriceData(orders))
  }

  return prices
}

export interface ECTradeCapitalPrice {
  typeId: number
  typeName: string
  groupId: number
  groupName: string
  price: number | null
  salesCount: number
  timeWindow: string | null
  hasSufficientData: boolean
}

interface ECTradeCapitalResponse {
  capitals: ECTradeCapitalPrice[]
}

export async function getCapitalPrices(): Promise<Map<number, number>> {
  console.log('[Capital] Fetching capital prices from EC Trade...')

  if (!window.electronAPI) {
    throw new Error('Electron API not available')
  }

  const data = (await window.electronAPI.fetchCapitalPrices()) as ECTradeCapitalResponse
  const priceMap = new Map<number, number>()

  for (const item of data.capitals) {
    if (item.price && item.hasSufficientData) {
      priceMap.set(item.typeId, item.price)
    }
  }

  console.log('[Capital] Loaded', priceMap.size, 'capital prices')
  return priceMap
}
