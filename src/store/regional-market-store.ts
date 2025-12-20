import { create } from 'zustand'
import { getRegionalSellOrders, DEFAULT_REGION_ID } from '@/api/endpoints/market'
import { logger } from '@/lib/logger'

const CACHE_TTL_MS = 5 * 60 * 1000
const PARALLEL_LIMIT = 10

interface RegionalMarketState {
  pricesByType: Map<number, number>
  pricesByLocation: Map<number, Map<number, number>>
  lastFetchAt: Map<string, number>
  isUpdating: boolean
  updateError: string | null
}

interface RegionalMarketActions {
  fetchPricesForTypes: (typeIds: number[], regionIds: number[]) => Promise<void>
  getPrice: (typeId: number) => number | undefined
  getPriceAtLocation: (typeId: number, locationId: number) => number | undefined
  clear: () => void
}

type RegionalMarketStore = RegionalMarketState & RegionalMarketActions

function cacheKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`
}

export const useRegionalMarketStore = create<RegionalMarketStore>((set, get) => ({
  pricesByType: new Map(),
  pricesByLocation: new Map(),
  lastFetchAt: new Map(),
  isUpdating: false,
  updateError: null,

  fetchPricesForTypes: async (typeIds: number[], regionIds: number[]) => {
    if (typeIds.length === 0) return
    if (get().isUpdating) return

    const allRegions = new Set(regionIds)
    allRegions.add(DEFAULT_REGION_ID)

    const state = get()
    const now = Date.now()

    const tasks: { regionId: number; typeId: number }[] = []
    for (const regionId of allRegions) {
      for (const typeId of typeIds) {
        const key = cacheKey(regionId, typeId)
        const lastFetch = state.lastFetchAt.get(key)
        if (!lastFetch || now - lastFetch > CACHE_TTL_MS) {
          tasks.push({ regionId, typeId })
        }
      }
    }

    if (tasks.length === 0) return

    set({ isUpdating: true, updateError: null })

    const pricesByType = new Map(state.pricesByType)
    const pricesByLocation = new Map(state.pricesByLocation)
    const lastFetchAt = new Map(state.lastFetchAt)

    const processBatch = async (batch: typeof tasks) => {
      await Promise.all(
        batch.map(async ({ regionId, typeId }) => {
          try {
            const orders = await getRegionalSellOrders(regionId, typeId)
            const key = cacheKey(regionId, typeId)
            lastFetchAt.set(key, Date.now())

            if (orders.length === 0) return

            let lowestInRegion = Infinity
            const locationPrices = new Map<number, number>()

            for (const order of orders) {
              if (order.price < lowestInRegion) {
                lowestInRegion = order.price
              }

              const currentLocationPrice = locationPrices.get(order.location_id)
              if (!currentLocationPrice || order.price < currentLocationPrice) {
                locationPrices.set(order.location_id, order.price)
              }
            }

            if (lowestInRegion < Infinity) {
              const currentTypePrice = pricesByType.get(typeId)
              if (!currentTypePrice || lowestInRegion < currentTypePrice) {
                pricesByType.set(typeId, lowestInRegion)
              }
            }

            let typeLocationMap = pricesByLocation.get(typeId)
            if (!typeLocationMap) {
              typeLocationMap = new Map()
              pricesByLocation.set(typeId, typeLocationMap)
            }
            for (const [locationId, price] of locationPrices) {
              typeLocationMap.set(locationId, price)
            }
          } catch (err) {
            logger.warn('Failed to fetch regional orders', {
              module: 'RegionalMarketStore',
              regionId,
              typeId,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        })
      )
    }

    try {
      for (let i = 0; i < tasks.length; i += PARALLEL_LIMIT) {
        const batch = tasks.slice(i, i + PARALLEL_LIMIT)
        await processBatch(batch)
      }

      set({
        pricesByType,
        pricesByLocation,
        lastFetchAt,
        isUpdating: false,
      })

      logger.info('Regional prices updated', {
        module: 'RegionalMarketStore',
        types: typeIds.length,
        regions: allRegions.size,
        tasks: tasks.length,
      })
    } catch (err) {
      set({
        isUpdating: false,
        updateError: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  },

  getPrice: (typeId: number) => {
    return get().pricesByType.get(typeId)
  },

  getPriceAtLocation: (typeId: number, locationId: number) => {
    const typeMap = get().pricesByLocation.get(typeId)
    return typeMap?.get(locationId)
  },

  clear: () => {
    set({
      pricesByType: new Map(),
      pricesByLocation: new Map(),
      lastFetchAt: new Map(),
      updateError: null,
    })
  },
}))
