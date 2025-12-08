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

export async function getCharacterOrders(
  characterId: number
): Promise<ESIMarketOrder[]> {
  return esiClient.fetch<ESIMarketOrder[]>(
    `/characters/${characterId}/orders/`
  )
}
