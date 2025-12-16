import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESIMarketOrderHistorySchema, ESICorporationMarketOrderHistorySchema } from '@/api/schemas'
import { z } from 'zod'

export type ESIMarketOrderHistory = z.infer<typeof ESIMarketOrderHistorySchema>
export type ESICorporationMarketOrderHistory = z.infer<typeof ESICorporationMarketOrderHistorySchema>
export type MarketOrderHistory = ESIMarketOrderHistory | ESICorporationMarketOrderHistory

export interface OwnerOrderHistory {
  owner: Owner
  orders: MarketOrderHistory[]
}

function transformState<T extends MarketOrderHistory>(order: T): T {
  if (order.state === 'expired' && order.volume_remain === 0) {
    return { ...order, state: 'completed' as const }
  }
  return order
}

async function fetchOrderHistoryForOwner(owner: Owner): Promise<{
  data: MarketOrderHistory[]
  expiresAt: number
  etag: string | null
}> {
  const endpoint =
    owner.type === 'corporation'
      ? `/corporations/${owner.id}/orders/history/`
      : `/characters/${owner.characterId}/orders/history/`

  if (owner.type === 'corporation') {
    const result = await esi.fetchPaginatedWithMeta<ESICorporationMarketOrderHistory>(endpoint, {
      characterId: owner.characterId,
      schema: ESICorporationMarketOrderHistorySchema,
    })
    result.data = result.data.map(transformState)
    return result
  }

  const result = await esi.fetchPaginatedWithMeta<ESIMarketOrderHistory>(endpoint, {
    characterId: owner.characterId,
    schema: ESIMarketOrderHistorySchema,
  })
  result.data = result.data.filter((order) => !order.is_corporation).map(transformState)
  return result
}

export const useMarketOrderHistoryStore = createOwnerStore<
  MarketOrderHistory[],
  OwnerOrderHistory
>({
  name: 'market order history',
  moduleName: 'MarketOrderHistoryStore',
  endpointPattern: '/orders/history/',
  dbConfig: {
    dbName: 'ecteveassets-market-order-history',
    storeName: 'order-history',
    dataKey: 'orders',
    metaStoreName: 'meta',
    version: 1,
  },
  getEndpoint: (owner) =>
    owner.type === 'corporation'
      ? `/corporations/${owner.id}/orders/history/`
      : `/characters/${owner.characterId}/orders/history/`,
  fetchData: fetchOrderHistoryForOwner,
  toOwnerData: (owner, data) => ({ owner, orders: data }),
  isEmpty: (data) => data.length === 0,
})
