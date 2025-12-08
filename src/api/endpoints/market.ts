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

export interface ESIMarketPrice {
  adjusted_price?: number
  average_price?: number
  type_id: number
}

export async function getCharacterOrders(
  characterId: number
): Promise<ESIMarketOrder[]> {
  return esiClient.fetch<ESIMarketOrder[]>(
    `/characters/${characterId}/orders/`
  )
}

// Fetches average market prices - public endpoint, no auth required
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
