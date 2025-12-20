import { type Owner, ownerKey } from './auth-store'
import { createOwnerStore, type BaseState } from './create-owner-store'
import { useToastStore } from './toast-store'
import { esi } from '@/api/esi'
import { ESIMarketOrderSchema, ESICorporationMarketOrderSchema } from '@/api/schemas'
import { getTypeName } from '@/store/reference-cache'
import { fetchMarketComparison, type MarketComparisonPrices } from '@/api/ref-client'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIMarketOrder = z.infer<typeof ESIMarketOrderSchema>
export type ESICorporationMarketOrder = z.infer<typeof ESICorporationMarketOrderSchema>
export type MarketOrder = ESIMarketOrder | ESICorporationMarketOrder

export interface OwnerOrders {
  owner: Owner
  orders: MarketOrder[]
}

interface MarketOrdersExtraState {
  comparisonData: Map<number, MarketComparisonPrices>
  comparisonFetching: boolean
}

interface MarketOrdersExtraActions {
  fetchComparisonData: () => Promise<void>
  getTotal: (prices: Map<number, number>, selectedOwnerIds: string[]) => number
}

function getEndpoint(owner: Owner): string {
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/orders/`
    : `/characters/${owner.characterId}/orders/`
}

async function fetchOrdersForOwner(owner: Owner): Promise<{
  data: MarketOrder[]
  expiresAt: number
  etag: string | null
}> {
  const endpoint = getEndpoint(owner)

  if (owner.type === 'corporation') {
    return esi.fetchPaginatedWithMeta<ESICorporationMarketOrder>(endpoint, {
      characterId: owner.characterId,
      schema: ESICorporationMarketOrderSchema,
    })
  }

  const result = await esi.fetchPaginatedWithMeta<ESIMarketOrder>(endpoint, {
    characterId: owner.characterId,
    schema: ESIMarketOrderSchema,
  })
  result.data = result.data.filter((order) => !order.is_corporation)
  return result
}

export const useMarketOrdersStore = createOwnerStore<
  MarketOrder[],
  OwnerOrders,
  MarketOrdersExtraState,
  MarketOrdersExtraActions
>({
  name: 'market orders',
  moduleName: 'MarketOrdersStore',
  endpointPattern: '/orders/',
  dbConfig: {
    dbName: 'ecteveassets-market-orders',
    storeName: 'orders',
    dataKey: 'orders',
    metaStoreName: 'meta',
    version: 2,
  },
  getEndpoint,
  fetchData: fetchOrdersForOwner,
  toOwnerData: (owner, data) => ({ owner, orders: data }),
  isEmpty: (data) => data.length === 0,
  extraState: {
    comparisonData: new Map(),
    comparisonFetching: false,
  },
  extraActions: (set, get) => ({
    fetchComparisonData: async () => {
      const state = get()
      if (state.comparisonFetching) return
      if (state.dataByOwner.length === 0) return

      set({ comparisonFetching: true })

      const typeIds = new Set<number>()
      for (const { orders } of state.dataByOwner) {
        for (const order of orders) {
          typeIds.add(order.type_id)
        }
      }

      try {
        const result = await fetchMarketComparison(Array.from(typeIds))
        set({ comparisonData: result, comparisonFetching: false })
      } catch (err) {
        logger.warn('Failed to fetch comparison data', {
          module: 'MarketOrdersStore',
          error: err instanceof Error ? err.message : String(err),
        })
        set({ comparisonFetching: false })
      }
    },
    getTotal: (prices, selectedOwnerIds) => {
      const selectedSet = new Set(selectedOwnerIds)
      let total = 0
      for (const { owner, orders } of get().dataByOwner) {
        if (!selectedSet.has(ownerKey(owner.type, owner.id))) continue
        for (const order of orders) {
          if (order.is_buy_order) {
            total += order.escrow ?? 0
          } else {
            total += (prices.get(order.type_id) ?? 0) * order.volume_remain
          }
        }
      }
      return total
    },
  }),
  onAfterBatchUpdate: async (results) => {
    if (results.length > 0) {
      await useMarketOrdersStore.getState().fetchComparisonData()
    }
  },
  onBeforeOwnerUpdate: (owner, state: BaseState<OwnerOrders>) => {
    const key = ownerKey(owner.type, owner.id)
    const previousOrders =
      state.dataByOwner.find((oo) => ownerKey(oo.owner.type, oo.owner.id) === key)?.orders ?? []
    return { previousData: previousOrders }
  },
  onAfterOwnerUpdate: ({ owner, newData, previousData }) => {
    useMarketOrdersStore.getState().fetchComparisonData()

    if (!previousData || previousData.length === 0) return

    const newOrderIds = new Set(newData.map((o) => o.order_id))
    const completedOrders = previousData.filter((o) => !newOrderIds.has(o.order_id))

    if (completedOrders.length > 0) {
      const toastStore = useToastStore.getState()
      for (const order of completedOrders) {
        const typeName = getTypeName(order.type_id)
        const action = order.is_buy_order ? 'Buy' : 'Sell'
        toastStore.addToast(
          'order-filled',
          `${action} Order Filled`,
          `${order.volume_total.toLocaleString()}x ${typeName}`
        )
      }
      logger.info('Market orders completed', {
        module: 'MarketOrdersStore',
        owner: owner.name,
        count: completedOrders.length,
      })
    }
  },
})
