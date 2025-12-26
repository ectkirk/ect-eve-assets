import { create } from 'zustand'
import { esi } from '@/api/esi'
import { ESIRegionOrderSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { useStoreRegistry } from '@/store/store-registry'
import {
  loadAllOrdersFromDB,
  saveOrdersToDB,
  deleteRegionsFromDB,
  clearOrdersDB,
  type StoredRegionOrders,
} from './regional-orders-db'
import type { ESIRegionOrder } from '@/api/endpoints/market'

const MODULE = 'RegionalOrdersStore'
const EMPTY_SET: ReadonlySet<number> = new Set()

interface RegionCache {
  ordersByType: Map<number, ESIRegionOrder[]>
  availableTypeIds: Set<number>
  fetchedAt: number
  expiresAt: number
}

interface RegionalOrdersState {
  regionId: number | null
  regionCache: Map<number, RegionCache>

  status: 'idle' | 'loading' | 'ready' | 'error'
  progress: { current: number; total: number } | null
  error: string | null
  initialized: boolean
}

interface RegionalOrdersActions {
  init: () => Promise<void>
  setRegion: (regionId: number) => Promise<void>
  getOrdersForType: (typeId: number) => ESIRegionOrder[]
  getAvailableTypeIds: () => ReadonlySet<number>
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

function countOrders(ordersByType: Map<number, ESIRegionOrder[]>): number {
  let count = 0
  for (const orders of ordersByType.values()) {
    count += orders.length
  }
  return count
}

let initPromise: Promise<void> | null = null

export const useRegionalOrdersStore = create<RegionalOrdersStore>(
  (set, get) => ({
    regionId: null,
    regionCache: new Map(),
    status: 'idle',
    progress: null,
    error: null,
    initialized: false,

    init: async () => {
      if (get().initialized) return
      if (initPromise) return initPromise

      initPromise = (async () => {
        try {
          const storedRegions = await loadAllOrdersFromDB()
          if (storedRegions.length > 0) {
            const now = Date.now()
            const newCache = new Map<number, RegionCache>()
            const expiredRegionIds: number[] = []

            for (const stored of storedRegions) {
              if (stored.expiresAt > now) {
                const ordersByType = buildOrdersByType(stored.orders)
                newCache.set(stored.regionId, {
                  ordersByType,
                  availableTypeIds: new Set(ordersByType.keys()),
                  fetchedAt: stored.fetchedAt,
                  expiresAt: stored.expiresAt,
                })
              } else {
                expiredRegionIds.push(stored.regionId)
              }
            }

            set({ regionCache: newCache, initialized: true })

            if (expiredRegionIds.length > 0) {
              deleteRegionsFromDB(expiredRegionIds).catch((err) => {
                logger.warn('Failed to delete expired regions from DB', {
                  module: MODULE,
                  error: err instanceof Error ? err.message : String(err),
                  regionIds: expiredRegionIds,
                })
              })
            }

            let totalOrders = 0
            for (const cache of newCache.values()) {
              totalOrders += countOrders(cache.ordersByType)
            }

            logger.info('Regional orders store initialized from cache', {
              module: MODULE,
              cachedRegions: newCache.size,
              expiredRegions: expiredRegionIds.length,
              totalOrders,
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
      if (!get().initialized) {
        await get().init()
      }

      const { status, regionCache } = get()
      const cached = regionCache.get(regionId)
      const now = Date.now()

      if (cached && cached.expiresAt > now) {
        set({ regionId, status: 'ready', error: null })
        logger.debug('Using cached orders for region', {
          module: MODULE,
          regionId,
          orderCount: countOrders(cached.ordersByType),
          expiresIn: cached.expiresAt - now,
        })
        return
      }

      if (status === 'loading') {
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
        const availableTypeIds = new Set(ordersByType.keys())
        const fetchedAt = Date.now()
        const expiresAt = result.expiresAt

        const newCache = new Map(get().regionCache)
        newCache.set(regionId, {
          ordersByType,
          availableTypeIds,
          fetchedAt,
          expiresAt,
        })

        set({
          regionCache: newCache,
          status: 'ready',
          progress: null,
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
      const { regionId, regionCache } = get()
      if (!regionId) return []
      const cached = regionCache.get(regionId)
      return cached?.ordersByType.get(typeId) ?? []
    },

    getAvailableTypeIds: () => {
      const { regionId, regionCache } = get()
      if (!regionId) return EMPTY_SET
      return regionCache.get(regionId)?.availableTypeIds ?? EMPTY_SET
    },

    clear: async () => {
      await clearOrdersDB()
      initPromise = null
      set({
        regionId: null,
        regionCache: new Map(),
        status: 'idle',
        progress: null,
        error: null,
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
