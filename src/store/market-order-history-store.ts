import { type Owner, ownerKey } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESIMarketOrderHistorySchema, ESICorporationMarketOrderHistorySchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIMarketOrderHistory = z.infer<typeof ESIMarketOrderHistorySchema>
export type ESICorporationMarketOrderHistory = z.infer<typeof ESICorporationMarketOrderHistorySchema>
export type MarketOrderHistory = ESIMarketOrderHistory | ESICorporationMarketOrderHistory

export interface OwnerOrderHistory {
  owner: Owner
  orders: MarketOrderHistory[]
}

function getEndpoint(owner: Owner): string {
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/orders/history/`
    : `/characters/${owner.characterId}/orders/history/`
}

function transformState<T extends MarketOrderHistory>(order: T): T {
  if (order.state === 'expired' && order.volume_remain === 0) {
    return { ...order, state: 'completed' as const }
  }
  return order
}

function getExistingData(owner: Owner): { orders: MarketOrderHistory[]; orderIds: Set<number> } {
  const state = useMarketOrderHistoryStore.getState()
  const key = ownerKey(owner.type, owner.id)
  const ownerData = state.dataByOwner.find(
    (d) => ownerKey(d.owner.type, d.owner.id) === key
  )
  const orders = ownerData?.orders ?? []
  return {
    orders,
    orderIds: new Set(orders.map((o) => o.order_id)),
  }
}

async function fetchOrderHistoryIncremental(
  owner: Owner,
  existingOrderIds: Set<number>
): Promise<{
  data: MarketOrderHistory[]
  expiresAt: number
  etag: string | null
}> {
  const isCorp = owner.type === 'corporation'
  const baseEndpoint = getEndpoint(owner)
  const schema = isCorp ? ESICorporationMarketOrderHistorySchema : ESIMarketOrderHistorySchema

  const newOrders: MarketOrderHistory[] = []
  let page = 1
  let totalPages = 1
  let expiresAt = Date.now() + 3600000
  let etag: string | null = null
  let foundExisting = false

  while (page <= totalPages && !foundExisting) {
    const pagedEndpoint = `${baseEndpoint}?page=${page}`

    try {
      const result = await esi.fetchWithMeta<MarketOrderHistory[]>(pagedEndpoint, {
        characterId: owner.characterId,
        schema: schema.array(),
      })

      expiresAt = result.expiresAt
      etag = result.etag
      if (result.xPages) totalPages = result.xPages

      for (const order of result.data) {
        if (!isCorp && 'is_corporation' in order && order.is_corporation) continue

        if (existingOrderIds.has(order.order_id)) {
          foundExisting = true
          break
        }
        newOrders.push(transformState(order))
      }

      if (foundExisting) {
        logger.info('Incremental fetch stopped early', {
          module: 'MarketOrderHistoryStore',
          owner: owner.name,
          page,
          totalPages,
          newOrders: newOrders.length,
        })
      }

      page++
    } catch (err) {
      logger.error('Failed to fetch order history page', err instanceof Error ? err : undefined, {
        module: 'MarketOrderHistoryStore',
        owner: owner.name,
        page,
      })
      throw err
    }
  }

  return { data: newOrders, expiresAt, etag }
}

async function fetchOrderHistoryForOwner(owner: Owner): Promise<{
  data: MarketOrderHistory[]
  expiresAt: number
  etag: string | null
}> {
  const { orders: existingOrders, orderIds: existingOrderIds } = getExistingData(owner)

  const { data: newOrders, expiresAt, etag } = await fetchOrderHistoryIncremental(
    owner,
    existingOrderIds
  )

  const mergedOrders = [...newOrders, ...existingOrders]

  logger.info('Order history fetched', {
    module: 'MarketOrderHistoryStore',
    owner: owner.name,
    newOrders: newOrders.length,
    existing: existingOrders.length,
    total: mergedOrders.length,
  })

  return { data: mergedOrders, expiresAt, etag }
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
    version: 2,
  },
  getEndpoint,
  fetchData: fetchOrderHistoryForOwner,
  toOwnerData: (owner, data) => ({ owner, orders: data }),
  isEmpty: (data) => data.length === 0,
})
