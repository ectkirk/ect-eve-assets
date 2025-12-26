import { create } from 'zustand'
import { esi } from '@/api/esi'
import { ESIRegionOrderSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { useStoreRegistry } from '@/store/store-registry'
import {
  loadOrdersFromDB,
  saveOrdersToDB,
  clearOrdersDB,
  type StoredRegionOrders,
} from './regional-orders-db'
import type { ESIRegionOrder } from '@/api/endpoints/market'

const MODULE = 'RegionalOrdersStore'

interface RegionalOrdersState {
  regionId: number | null
  orders: ESIRegionOrder[]
  ordersByType: Map<number, ESIRegionOrder[]>

  status: 'idle' | 'loading' | 'ready' | 'error'
  progress: { current: number; total: number } | null
  error: string | null
  fetchedAt: number | null
  expiresAt: number | null
  initialized: boolean
}

interface RegionalOrdersActions {
  init: () => Promise<void>
  setRegion: (regionId: number) => Promise<void>
  getOrdersForType: (typeId: number) => ESIRegionOrder[]
  clear: () => Promise<void>
}

type RegionalOrdersStore = RegionalOrdersState & RegionalOrdersActions

function buildOrdersByType(
  orders: ESIRegionOrder[]
): Map<number, ESIRegionOrder[]> {
  const map = new Map<number, ESIRegionOrder[]>()
  for (const order of orders) {
    const existing = map.get(order.type_id)
    if (existing) {
      existing.push(order)
    } else {
      map.set(order.type_id, [order])
    }
  }
  return map
}

let initPromise: Promise<void> | null = null

export const useRegionalOrdersStore = create<RegionalOrdersStore>(
  (set, get) => ({
    regionId: null,
    orders: [],
    ordersByType: new Map(),
    status: 'idle',
    progress: null,
    error: null,
    fetchedAt: null,
    expiresAt: null,
    initialized: false,

    init: async () => {
      if (get().initialized) return
      if (initPromise) return initPromise

      initPromise = (async () => {
        try {
          const stored = await loadOrdersFromDB()
          if (stored) {
            const now = Date.now()
            const isExpired = stored.expiresAt <= now

            set({
              regionId: stored.regionId,
              orders: stored.orders,
              ordersByType: buildOrdersByType(stored.orders),
              fetchedAt: stored.fetchedAt,
              expiresAt: stored.expiresAt,
              status: isExpired ? 'idle' : 'ready',
              initialized: true,
            })

            logger.info('Regional orders store initialized from cache', {
              module: MODULE,
              regionId: stored.regionId,
              orderCount: stored.orders.length,
              expired: isExpired,
            })
          } else {
            set({ initialized: true })
            logger.info('Regional orders store initialized (empty)', {
              module: MODULE,
            })
          }
        } catch (err) {
          logger.error(
            'Failed to load regional orders from DB',
            err instanceof Error ? err : undefined,
            { module: MODULE }
          )
          set({ initialized: true })
        }
      })()

      return initPromise
    },

    setRegion: async (regionId: number) => {
      const state = get()

      if (!state.initialized) {
        await get().init()
      }

      const now = Date.now()
      if (
        state.regionId === regionId &&
        state.expiresAt &&
        state.expiresAt > now &&
        state.status === 'ready'
      ) {
        logger.debug('Using cached orders for region', {
          module: MODULE,
          regionId,
          expiresIn: state.expiresAt - now,
        })
        return
      }

      if (state.status === 'loading') {
        logger.debug('Already loading, skipping', { module: MODULE, regionId })
        return
      }

      set({
        status: 'loading',
        progress: null,
        error: null,
        regionId,
      })

      logger.info('Fetching all orders for region', {
        module: MODULE,
        regionId,
      })
      const startTime = Date.now()

      try {
        const result = await esi.fetchPaginatedWithProgress<ESIRegionOrder>(
          `/markets/${regionId}/orders/?order_type=all`,
          {
            requiresAuth: false,
            schema: ESIRegionOrderSchema,
            onProgress: (progress) => {
              set({ progress })
            },
          }
        )

        const orders = result.data
        const ordersByType = buildOrdersByType(orders)
        const fetchedAt = Date.now()
        const expiresAt = result.expiresAt

        set({
          orders,
          ordersByType,
          status: 'ready',
          progress: null,
          fetchedAt,
          expiresAt,
        })

        const stored: StoredRegionOrders = {
          regionId,
          orders,
          fetchedAt,
          expiresAt,
        }
        saveOrdersToDB(stored).catch((err) => {
          logger.error(
            'Failed to save orders to DB',
            err instanceof Error ? err : undefined,
            { module: MODULE }
          )
        })

        logger.info('Regional orders loaded', {
          module: MODULE,
          regionId,
          orderCount: orders.length,
          typeCount: ordersByType.size,
          durationMs: Date.now() - startTime,
        })
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load orders'
        set({
          status: 'error',
          progress: null,
          error: errorMessage,
        })
        logger.error(
          'Failed to fetch regional orders',
          err instanceof Error ? err : undefined,
          { module: MODULE, regionId }
        )
      }
    },

    getOrdersForType: (typeId: number) => {
      return get().ordersByType.get(typeId) ?? []
    },

    clear: async () => {
      await clearOrdersDB()
      initPromise = null
      set({
        regionId: null,
        orders: [],
        ordersByType: new Map(),
        status: 'idle',
        progress: null,
        error: null,
        fetchedAt: null,
        expiresAt: null,
        initialized: false,
      })
    },
  })
)

useStoreRegistry.getState().register({
  name: 'regional orders',
  clear: useRegionalOrdersStore.getState().clear,
  getIsUpdating: () => useRegionalOrdersStore.getState().status === 'loading',
  init: useRegionalOrdersStore.getState().init,
})
