import { create } from 'zustand'
import { DEFAULT_REGION_ID } from '@/api/endpoints/market'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { useStoreRegistry } from '@/store/store-registry'
import { usePriceStore } from '@/store/price-store'
import { logger } from '@/lib/logger'
import { getErrorMessage } from '@/lib/errors'
import {
  loadFromDB,
  saveTrackedToDB,
  deleteTrackedFromDB,
  deletePricesFromDB,
  saveStructureToDB,
  deleteStructuresFromDB,
  clearDB,
  type TrackedRecord,
  type TrackedStructureRecord,
} from './regional-market-db'
import {
  cacheKey,
  deepClonePricesByLocation,
  executeUpdate,
} from './regional-market-update'
import {
  CACHE_TTL_MS,
  hydrateFromRecords,
  collectTasks,
  cleanupLocationPrices,
  type TrackedType,
  type TrackedStructure,
} from './regional-market-helpers'

const OWNER_KEY = 'regional-market'
const ENDPOINT_PATTERN = '/markets/regional/'

interface RegionalMarketState {
  pricesByType: Map<number, number>
  pricesByLocation: Map<number, Map<number, number>>
  buyPricesByType: Map<number, number>
  buyPricesByLocation: Map<number, Map<number, number>>
  lastFetchAt: Map<string, number>
  trackedTypes: Map<string, TrackedType>
  trackedStructures: Map<number, TrackedStructure>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface RegionalMarketActions {
  init: () => Promise<void>
  update: () => Promise<void>
  registerTypes: (typeIds: number[], regionIds: number[]) => void
  registerStructures: (
    structureIds: number[],
    typeIds: number[],
    characterId: number
  ) => void
  untrackTypes: (typeIds: number[]) => Promise<void>
  untrackStructures: (structureIds: number[]) => Promise<void>
  syncTypesWithOrders: (activeTypeIds: Set<number>) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  getPrice: (typeId: number) => number | undefined
  getPriceAtLocation: (typeId: number, locationId: number) => number | undefined
  getHighestBuyAtLocation: (
    typeId: number,
    locationId: number
  ) => number | undefined
  clear: () => Promise<void>
}

type RegionalMarketStore = RegionalMarketState & RegionalMarketActions

let initPromise: Promise<void> | null = null

export const useRegionalMarketStore = create<RegionalMarketStore>(
  (set, get) => ({
    pricesByType: new Map(),
    pricesByLocation: new Map(),
    buyPricesByType: new Map(),
    buyPricesByLocation: new Map(),
    lastFetchAt: new Map(),
    trackedTypes: new Map(),
    trackedStructures: new Map(),
    isUpdating: false,
    updateError: null,
    initialized: false,

    init: async () => {
      if (get().initialized) return
      if (initPromise) return initPromise

      initPromise = (async () => {
        try {
          const { prices, tracked, structures } = await loadFromDB()
          const hydrated = hydrateFromRecords(prices, tracked, structures)

          set({ ...hydrated, initialized: true })

          if (hydrated.pricesByType.size > 0) {
            usePriceStore.getState().setMarketPrices(hydrated.pricesByType)
          }

          logger.info('Regional market store initialized', {
            module: 'RegionalMarketStore',
            types: hydrated.pricesByType.size,
            tracked: hydrated.trackedTypes.size,
            structures: hydrated.trackedStructures.size,
          })

          get().update()
        } catch (err) {
          logger.error(
            'Failed to load regional market from DB',
            err instanceof Error ? err : undefined,
            {
              module: 'RegionalMarketStore',
            }
          )
          set({ initialized: true })
        }
      })()

      return initPromise
    },

    update: async () => {
      const state = get()
      if (!state.initialized) {
        await get().init()
        return
      }
      if (state.isUpdating) return
      if (state.trackedTypes.size === 0 && state.trackedStructures.size === 0)
        return

      const { regionalTasks, structureTasks, earliestExpiry } = collectTasks(
        state,
        Date.now()
      )

      if (regionalTasks.length === 0 && structureTasks.length === 0) {
        if (earliestExpiry < Infinity) {
          useExpiryCacheStore
            .getState()
            .setExpiry(OWNER_KEY, ENDPOINT_PATTERN, earliestExpiry)
        }
        return
      }

      set({ isUpdating: true, updateError: null })

      try {
        const result = await executeUpdate({
          regionalTasks,
          structureTasks,
          currentState: {
            pricesByType: state.pricesByType,
            pricesByLocation: state.pricesByLocation,
            buyPricesByType: state.buyPricesByType,
            buyPricesByLocation: state.buyPricesByLocation,
            lastFetchAt: state.lastFetchAt,
            trackedStructures: state.trackedStructures,
          },
        })

        set({
          pricesByType: result.sellPricesByType,
          pricesByLocation: result.sellPricesByLocation,
          buyPricesByType: result.buyPricesByType,
          buyPricesByLocation: result.buyPricesByLocation,
          lastFetchAt: result.lastFetchAt,
          trackedStructures: result.trackedStructures,
          isUpdating: false,
        })

        usePriceStore.getState().setMarketPrices(result.sellPricesByType)

        if (get().trackedTypes.size > 0 || get().trackedStructures.size > 0) {
          useExpiryCacheStore
            .getState()
            .setExpiry(OWNER_KEY, ENDPOINT_PATTERN, Date.now() + CACHE_TTL_MS)
        }
      } catch (err) {
        set({
          isUpdating: false,
          updateError: getErrorMessage(err),
        })
      }
    },

    registerTypes: (typeIds, regionIds) => {
      const state = get()
      const allRegions = new Set([...regionIds, DEFAULT_REGION_ID])
      const newTracked: TrackedRecord[] = []
      const trackedTypes = new Map(state.trackedTypes)

      for (const regionId of allRegions) {
        for (const typeId of typeIds) {
          const key = cacheKey(regionId, typeId)
          if (!trackedTypes.has(key)) {
            trackedTypes.set(key, { typeId, regionId })
            newTracked.push({ key, typeId, regionId })
          }
        }
      }

      if (newTracked.length > 0) {
        set({ trackedTypes })
        saveTrackedToDB(newTracked).catch((err) => {
          logger.error(
            'Failed to save tracked types',
            err instanceof Error ? err : undefined,
            {
              module: 'RegionalMarketStore',
            }
          )
        })

        if (state.initialized && !state.isUpdating) get().update()
      }
    },

    untrackTypes: async (typeIds) => {
      if (typeIds.length === 0) return

      const state = get()
      const typeIdSet = new Set(typeIds)
      const keysToDelete: string[] = []
      const trackedTypes = new Map(state.trackedTypes)
      const pricesByType = new Map(state.pricesByType)
      const pricesByLocation = new Map(state.pricesByLocation)
      const buyPricesByType = new Map(state.buyPricesByType)
      const buyPricesByLocation = new Map(state.buyPricesByLocation)
      const lastFetchAt = new Map(state.lastFetchAt)

      for (const [key, { typeId }] of state.trackedTypes) {
        if (typeIdSet.has(typeId)) {
          keysToDelete.push(key)
          trackedTypes.delete(key)
          lastFetchAt.delete(key)
        }
      }

      for (const typeId of typeIds) {
        pricesByType.delete(typeId)
        pricesByLocation.delete(typeId)
        buyPricesByType.delete(typeId)
        buyPricesByLocation.delete(typeId)
      }

      if (keysToDelete.length > 0) {
        set({
          trackedTypes,
          pricesByType,
          pricesByLocation,
          buyPricesByType,
          buyPricesByLocation,
          lastFetchAt,
        })

        try {
          await deleteTrackedFromDB(keysToDelete)
          await deletePricesFromDB(typeIds)
          logger.info('Untracked types from regional market', {
            module: 'RegionalMarketStore',
            types: typeIds.length,
          })
        } catch (err) {
          logger.error(
            'Failed to delete untracked types from DB',
            err instanceof Error ? err : undefined,
            {
              module: 'RegionalMarketStore',
            }
          )
        }
      }
    },

    registerStructures: (structureIds, typeIds, characterId) => {
      if (structureIds.length === 0 || typeIds.length === 0) return

      const state = get()
      const trackedStructures = new Map(state.trackedStructures)
      const newStructures: TrackedStructureRecord[] = []
      let hasChanges = false

      for (const structureId of structureIds) {
        const existing = trackedStructures.get(structureId)
        if (existing) {
          const mergedTypeIds = new Set(existing.typeIds)
          let modified = false
          for (const typeId of typeIds) {
            if (!mergedTypeIds.has(typeId)) {
              mergedTypeIds.add(typeId)
              modified = true
            }
          }
          if (modified) {
            const updated = { ...existing, typeIds: mergedTypeIds }
            trackedStructures.set(structureId, updated)
            hasChanges = true
            newStructures.push({
              structureId,
              characterId: existing.characterId,
              typeIds: Array.from(mergedTypeIds),
              lastFetchAt: existing.lastFetchAt,
            })
          }
        } else {
          const typeIdSet = new Set(typeIds)
          trackedStructures.set(structureId, {
            characterId,
            typeIds: typeIdSet,
            lastFetchAt: 0,
          })
          hasChanges = true
          newStructures.push({
            structureId,
            characterId,
            typeIds: Array.from(typeIdSet),
            lastFetchAt: 0,
          })
        }
      }

      if (hasChanges) {
        set({ trackedStructures })
        for (const record of newStructures) {
          saveStructureToDB(record).catch((err) => {
            logger.error(
              'Failed to save tracked structure',
              err instanceof Error ? err : undefined,
              {
                module: 'RegionalMarketStore',
                structureId: record.structureId,
              }
            )
          })
        }

        if (state.initialized && !state.isUpdating) get().update()
      }
    },

    untrackStructures: async (structureIds) => {
      if (structureIds.length === 0) return

      const state = get()
      const structureIdSet = new Set(structureIds)
      const trackedStructures = new Map(state.trackedStructures)
      const pricesByLocation = deepClonePricesByLocation(state.pricesByLocation)
      const pricesByType = new Map(state.pricesByType)
      const buyPricesByLocation = deepClonePricesByLocation(
        state.buyPricesByLocation
      )
      const buyPricesByType = new Map(state.buyPricesByType)
      const toDelete: number[] = []

      for (const structureId of structureIds) {
        if (trackedStructures.has(structureId)) {
          trackedStructures.delete(structureId)
          toDelete.push(structureId)
        }
      }

      cleanupLocationPrices(
        pricesByLocation,
        pricesByType,
        structureIdSet,
        Math.min
      )
      cleanupLocationPrices(
        buyPricesByLocation,
        buyPricesByType,
        structureIdSet,
        Math.max
      )

      if (toDelete.length > 0) {
        set({
          trackedStructures,
          pricesByLocation,
          pricesByType,
          buyPricesByLocation,
          buyPricesByType,
        })

        try {
          await deleteStructuresFromDB(toDelete)
          logger.info('Untracked structures from regional market', {
            module: 'RegionalMarketStore',
            structures: toDelete.length,
          })
        } catch (err) {
          logger.error(
            'Failed to delete untracked structures from DB',
            err instanceof Error ? err : undefined,
            {
              module: 'RegionalMarketStore',
            }
          )
        }
      }
    },

    syncTypesWithOrders: async (activeTypeIds) => {
      const staleTypeIds: number[] = []
      for (const { typeId } of get().trackedTypes.values()) {
        if (!activeTypeIds.has(typeId)) staleTypeIds.push(typeId)
      }

      if (staleTypeIds.length > 0) {
        await get().untrackTypes(staleTypeIds)
      }
    },

    removeForOwner: async (ownerType, ownerId) => {
      if (ownerType !== 'character') return

      const structuresToRemove: number[] = []
      for (const [structureId, { characterId }] of get().trackedStructures) {
        if (characterId === ownerId) structuresToRemove.push(structureId)
      }

      if (structuresToRemove.length > 0) {
        await get().untrackStructures(structuresToRemove)
        logger.info('Removed structures for owner', {
          module: 'RegionalMarketStore',
          characterId: ownerId,
          structures: structuresToRemove.length,
        })
      }

      const { useMarketOrdersStore } = await import('./market-orders-store')
      const activeTypeIds = new Set<number>()
      for (const stored of useMarketOrdersStore.getState().itemsById.values()) {
        activeTypeIds.add(stored.item.type_id)
      }
      await get().syncTypesWithOrders(activeTypeIds)
    },

    getPrice: (typeId) => get().pricesByType.get(typeId),
    getPriceAtLocation: (typeId, locationId) =>
      get().pricesByLocation.get(typeId)?.get(locationId),
    getHighestBuyAtLocation: (typeId, locationId) =>
      get().buyPricesByLocation.get(typeId)?.get(locationId),

    clear: async () => {
      await clearDB()
      initPromise = null
      useExpiryCacheStore.getState().clearForOwner(OWNER_KEY)
      set({
        pricesByType: new Map(),
        pricesByLocation: new Map(),
        buyPricesByType: new Map(),
        buyPricesByLocation: new Map(),
        lastFetchAt: new Map(),
        trackedTypes: new Map(),
        trackedStructures: new Map(),
        updateError: null,
        initialized: false,
      })
    },
  })
)

useExpiryCacheStore
  .getState()
  .registerRefreshCallback(ENDPOINT_PATTERN, async () => {
    await useRegionalMarketStore.getState().update()
  })

useStoreRegistry.getState().register({
  name: 'regional market',
  removeForOwner: useRegionalMarketStore.getState().removeForOwner,
  clear: useRegionalMarketStore.getState().clear,
  getIsUpdating: () => useRegionalMarketStore.getState().isUpdating,
  init: useRegionalMarketStore.getState().init,
  update: useRegionalMarketStore.getState().update,
})
