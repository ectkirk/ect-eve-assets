import { type Owner } from './auth-store'
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
  comparisonData: Map<string, MarketComparisonPrices>
  comparisonFetching: boolean
}

interface MarketOrdersExtraActions {
  fetchComparisonData: () => Promise<void>
}

async function fetchOrdersForOwner(owner: Owner): Promise<{
  data: MarketOrder[]
  expiresAt: number
  etag: string | null
}> {
  const endpoint =
    owner.type === 'corporation'
      ? `/corporations/${owner.id}/orders/`
      : `/characters/${owner.characterId}/orders/`

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
  getEndpoint: (owner) =>
    owner.type === 'corporation'
      ? `/corporations/${owner.id}/orders/`
      : `/characters/${owner.characterId}/orders/`,
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

      const ordersByLocation = new Map<number, Set<number>>()
      for (const { orders } of state.dataByOwner) {
        for (const order of orders) {
          let typeIds = ordersByLocation.get(order.location_id)
          if (!typeIds) {
            typeIds = new Set()
            ordersByLocation.set(order.location_id, typeIds)
          }
          typeIds.add(order.type_id)
        }
      }

      const newData = new Map<string, MarketComparisonPrices>()
      for (const [locationId, typeIds] of ordersByLocation) {
        try {
          const result = await fetchMarketComparison(Array.from(typeIds), locationId)
          for (const [typeId, prices] of result) {
            newData.set(`${locationId}-${typeId}`, prices)
          }
        } catch (err) {
          logger.warn('Failed to fetch comparison data', {
            module: 'MarketOrdersStore',
            locationId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      set({ comparisonData: newData, comparisonFetching: false })
    },
  }),
  onAfterBatchUpdate: async (results) => {
    if (results.length > 0) {
      await useMarketOrdersStore.getState().fetchComparisonData()
    }
  },
  onBeforeOwnerUpdate: (owner, state: BaseState<OwnerOrders>) => {
    const ownerKey = `${owner.type}-${owner.id}`
    const previousOrders =
      state.dataByOwner.find((oo) => `${oo.owner.type}-${oo.owner.id}` === ownerKey)?.orders ?? []
    return { previousData: previousOrders }
  },
  onAfterOwnerUpdate: ({ owner, newData, previousData }) => {
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

    useMarketOrdersStore.getState().fetchComparisonData()
  },
})
