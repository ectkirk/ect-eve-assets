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

function transformState<T extends MarketOrderHistory>(order: T): T {
  if (order.state === 'expired' && order.volume_remain === 0) {
    return { ...order, state: 'completed' as const }
  }
  return order
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
  const baseEndpoint = isCorp
    ? `/corporations/${owner.id}/orders/history/`
    : `/characters/${owner.characterId}/orders/history/`

  const schema = isCorp ? ESICorporationMarketOrderHistorySchema : ESIMarketOrderHistorySchema
  const newOrders: MarketOrderHistory[] = []
  let page = 1
  let totalPages = 1
  let expiresAt = Date.now() + 3600000
  let etag: string | null = null
  let foundExisting = false

  while (page <= totalPages && !foundExisting) {
    const separator = baseEndpoint.includes('?') ? '&' : '?'
    const pagedEndpoint = `${baseEndpoint}${separator}page=${page}`

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
  }

  return { data: newOrders, expiresAt, etag }
}

function getExistingOrderIds(owner: Owner): Set<number> {
  const state = useMarketOrderHistoryStore.getState()
  const key = ownerKey(owner.type, owner.id)
  const ownerData = state.dataByOwner.find(
    (d) => ownerKey(d.owner.type, d.owner.id) === key
  )
  if (!ownerData) return new Set()
  return new Set(ownerData.orders.map((o) => o.order_id))
}

function getExistingOrders(owner: Owner): MarketOrderHistory[] {
  const state = useMarketOrderHistoryStore.getState()
  const key = ownerKey(owner.type, owner.id)
  const ownerData = state.dataByOwner.find(
    (d) => ownerKey(d.owner.type, d.owner.id) === key
  )
  return ownerData?.orders ?? []
}

async function fetchOrderHistoryForOwner(owner: Owner): Promise<{
  data: MarketOrderHistory[]
  expiresAt: number
  etag: string | null
}> {
  const existingOrderIds = getExistingOrderIds(owner)
  const existingOrders = getExistingOrders(owner)

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
  getEndpoint: (owner) =>
    owner.type === 'corporation'
      ? `/corporations/${owner.id}/orders/history/`
      : `/characters/${owner.characterId}/orders/history/`,
  fetchData: fetchOrderHistoryForOwner,
  toOwnerData: (owner, data) => ({ owner, orders: data }),
  isEmpty: (data) => data.length === 0,
})
