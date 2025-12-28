import { create } from 'zustand'
import { esi } from '@/api/esi'
import { ESIRegionOrderSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { useStoreRegistry } from '@/store/store-registry'
import {
  loadAllOrdersFromDB,
  saveOrdersToDB,
  deleteExpiredFromDB,
  clearOrdersDB,
  type StoredTypeOrders,
} from './regional-orders-db'
import type { ESIRegionOrder } from '@/api/endpoints/market'

const MODULE = 'RegionalOrdersStore'

interface TypeOrderCache {
  orders: ESIRegionOrder[]
  fetchedAt: number
  expiresAt: number
}

interface RegionalOrdersState {
  regionId: number | null
  typeOrderCache: Map<string, TypeOrderCache>
  loadingTypeId: number | null
  error: string | null
  initialized: boolean
}

interface RegionalOrdersActions {
  init: () => Promise<void>
  setRegion: (regionId: number) => void
  fetchOrdersForType: (typeId: number) => Promise<ESIRegionOrder[]>
  getOrdersForType: (typeId: number) => ESIRegionOrder[] | null
  getTypeStatus: (typeId: number) => 'idle' | 'loading' | 'ready' | 'error'
  clear: () => Promise<void>
}

type RegionalOrdersStore = RegionalOrdersState & RegionalOrdersActions

function cacheKey(regionId: number, typeId: number): string {
  return `${regionId}-${typeId}`
}

let initPromise: Promise<void> | null = null

export const useRegionalOrdersStore = create<RegionalOrdersStore>(
  (set, get) => ({
    regionId: null,
    typeOrderCache: new Map(),
    loadingTypeId: null,
    error: null,
    initialized: false,

    init: async () => {
      if (get().initialized) return
      if (initPromise) return initPromise

      initPromise = (async () => {
        try {
          const storedOrders = await loadAllOrdersFromDB()
          if (storedOrders.length > 0) {
            const now = Date.now()
            const newCache = new Map<string, TypeOrderCache>()
            const expiredKeys: string[] = []

            for (const stored of storedOrders) {
              const key = cacheKey(stored.regionId, stored.typeId)
              if (stored.expiresAt > now) {
                newCache.set(key, {
                  orders: stored.orders,
                  fetchedAt: stored.fetchedAt,
                  expiresAt: stored.expiresAt,
                })
              } else {
                expiredKeys.push(key)
              }
            }

            set({ typeOrderCache: newCache, initialized: true })

            if (expiredKeys.length > 0) {
              deleteExpiredFromDB(expiredKeys).catch((err) => {
                logger.warn('Failed to delete expired orders from DB', {
                  module: MODULE,
                  error: err instanceof Error ? err.message : String(err),
                  count: expiredKeys.length,
                })
              })
            }

            logger.info('Regional orders store initialized from cache', {
              module: MODULE,
              cachedTypes: newCache.size,
              expiredTypes: expiredKeys.length,
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

    setRegion: (regionId: number) => {
      set({ regionId, error: null })
    },

    fetchOrdersForType: async (typeId: number) => {
      const { regionId, typeOrderCache, loadingTypeId } = get()

      if (!regionId) {
        return []
      }

      const key = cacheKey(regionId, typeId)
      const cached = typeOrderCache.get(key)
      const now = Date.now()

      if (cached && cached.expiresAt > now) {
        logger.debug('Using cached orders for type', {
          module: MODULE,
          regionId,
          typeId,
          orderCount: cached.orders.length,
          expiresIn: cached.expiresAt - now,
        })
        return cached.orders
      }

      if (loadingTypeId === typeId) {
        return cached?.orders ?? []
      }

      set({ loadingTypeId: typeId, error: null })

      const startTime = Date.now()

      try {
        const result = await esi.fetchPaginatedWithMeta<ESIRegionOrder>(
          `/markets/${regionId}/orders?order_type=all&type_id=${typeId}`,
          {
            requiresAuth: false,
            schema: ESIRegionOrderSchema,
          }
        )

        const orders = result.data
        const fetchedAt = Date.now()
        const expiresAt = result.expiresAt

        const newCache = new Map(get().typeOrderCache)
        newCache.set(key, {
          orders,
          fetchedAt,
          expiresAt,
        })

        set({
          typeOrderCache: newCache,
          loadingTypeId: null,
        })

        const stored: StoredTypeOrders = {
          regionId,
          typeId,
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

        logger.info('Type orders loaded', {
          module: MODULE,
          regionId,
          typeId,
          orderCount: orders.length,
          durationMs: Date.now() - startTime,
        })

        return orders
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load orders'
        set({
          loadingTypeId: null,
          error: errorMessage,
        })
        logger.error(
          'Failed to fetch type orders',
          err instanceof Error ? err : undefined,
          { module: MODULE, regionId, typeId }
        )
        return []
      }
    },

    getOrdersForType: (typeId: number) => {
      const { regionId, typeOrderCache } = get()
      if (!regionId) return null
      const key = cacheKey(regionId, typeId)
      const cached = typeOrderCache.get(key)
      return cached?.orders ?? null
    },

    getTypeStatus: (typeId: number) => {
      const { regionId, typeOrderCache, loadingTypeId, error } = get()
      if (!regionId) return 'idle'
      if (loadingTypeId === typeId) return 'loading'
      if (error && loadingTypeId === null) return 'error'
      const key = cacheKey(regionId, typeId)
      return typeOrderCache.has(key) ? 'ready' : 'idle'
    },

    clear: async () => {
      await clearOrdersDB()
      initPromise = null
      set({
        regionId: null,
        typeOrderCache: new Map(),
        loadingTypeId: null,
        error: null,
        initialized: false,
      })
    },
  })
)

useStoreRegistry.getState().register({
  name: 'regional orders',
  clear: useRegionalOrdersStore.getState().clear,
  getIsUpdating: () => useRegionalOrdersStore.getState().loadingTypeId !== null,
  init: useRegionalOrdersStore.getState().init,
})
