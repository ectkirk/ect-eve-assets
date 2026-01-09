import { create } from 'zustand'
import { getMarketPrices } from '@/api/endpoints/market'
import { logger } from '@/lib/logger'
import { getTypeBasePrice, isTypeBlueprint } from '@/store/reference-cache'
import { useStoreRegistry } from '@/store/store-registry'
import { isAbyssalTypeId } from './price-utils'
import {
  setLastJitaRefreshAt,
  setLastEsiRefreshAt,
  clearRefreshTimestamps,
  clearJitaRefreshTimestamp,
  clearEsiRefreshTimestamp,
} from './price-timestamps'
import {
  loadAbyssalPricesFromDB,
  saveAbyssalPricesToDB,
  clearAbyssalDB,
  loadJitaPricesFromDB,
  clearJitaDB,
  loadEsiPricesFromDB,
  saveEsiPricesToDB,
  clearEsiDB,
  clearAllPricesDB,
  type EsiPriceRecord,
} from './price-db'
import { shouldRefreshEsi, shouldRefreshJita } from './price-refresh-schedule'
import {
  scheduleEsiRefresh,
  startJitaRefreshTimer,
  stopPriceRefreshTimers,
} from './price-refresh-timers'
import { storeAndPersistPrices } from './price-persistence'

export {
  ABYSSAL_TYPE_IDS,
  isAbyssalTypeId,
  extractPriceableIds,
} from './price-utils'
export { stopPriceRefreshTimers } from './price-refresh-timers'

export interface EsiPriceData {
  average?: number
  adjusted?: number
}

interface PriceState {
  jitaPrices: Map<number, number>
  esiPrices: Map<number, EsiPriceData>
  abyssalPrices: Map<number, number>
  marketPrices: Map<number, number>
  isUpdatingJita: boolean
  isUpdatingEsi: boolean
  initialized: boolean
  priceVersion: number
}

export interface GetItemPriceOptions {
  itemId?: number
  isBlueprintCopy?: boolean
}

interface PriceActions {
  init: () => Promise<void>
  getItemPrice: (typeId: number, options?: GetItemPriceOptions) => number
  getAbyssalPrice: (itemId: number) => number | undefined
  hasAbyssalPrice: (itemId: number) => boolean
  ensureJitaPrices: (
    typeIds: number[],
    abyssalItemIds?: number[]
  ) => Promise<Map<number, number>>
  setAbyssalPrices: (
    prices: Array<{ itemId: number; price: number }>
  ) => Promise<void>
  setMarketPrices: (prices: Map<number, number>) => void
  refreshAllJitaPrices: (
    typeIds: number[],
    abyssalItemIds?: number[]
  ) => Promise<void>
  refreshEsiPrices: () => Promise<void>
  pruneAbyssalPrices: (ownedAbyssalIds: Set<number>) => Promise<void>
  clearAbyssal: () => Promise<void>
  clearJita: () => Promise<void>
  clearEsi: () => Promise<void>
  clear: () => Promise<void>
}

type PriceStore = PriceState & PriceActions

let initPromise: Promise<void> | null = null

async function triggerJitaRefreshIfNeeded(): Promise<void> {
  try {
    const { useExpiryCacheStore } = await import('./expiry-cache-store')
    const { useAssetStore } = await import('./asset-store')
    const { collectOwnedIds } = await import('./type-id-collector')
    const { useContractsStore } = await import('./contracts-store')
    const { useMarketOrdersStore } = await import('./market-orders-store')
    const { useIndustryJobsStore } = await import('./industry-jobs-store')
    const { useStructuresStore } = await import('./structures-store')

    const state = usePriceStore.getState()
    if (!state.initialized || state.isUpdatingJita) return
    if (useExpiryCacheStore.getState().isPaused) return

    const { typeIds, abyssalItemIds } = collectOwnedIds(
      useAssetStore.getState().assetsByOwner,
      useMarketOrdersStore.getOrdersByOwner(),
      useContractsStore.getContractsByOwner(),
      useIndustryJobsStore.getJobsByOwner(),
      useStructuresStore.getState().dataByOwner
    )

    if (typeIds.size > 0 || abyssalItemIds.size > 0) {
      logger.info('Jita price refresh triggered', { module: 'PriceStore' })
      await state.refreshAllJitaPrices(
        Array.from(typeIds),
        Array.from(abyssalItemIds)
      )
    }

    await state.pruneAbyssalPrices(abyssalItemIds)
  } catch (err) {
    logger.error(
      'Jita refresh timer failed',
      err instanceof Error ? err : undefined,
      { module: 'PriceStore' }
    )
  }
}

export const usePriceStore = create<PriceStore>((set, get) => ({
  jitaPrices: new Map(),
  esiPrices: new Map(),
  abyssalPrices: new Map(),
  marketPrices: new Map(),
  isUpdatingJita: false,
  isUpdatingEsi: false,
  initialized: false,
  priceVersion: 0,

  init: async () => {
    if (get().initialized) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        const [abyssalRecords, jitaRecords, esiRecords] = await Promise.all([
          loadAbyssalPricesFromDB(),
          loadJitaPricesFromDB(),
          loadEsiPricesFromDB(),
        ])

        const abyssalPrices = new Map<number, number>()
        for (const record of abyssalRecords) {
          abyssalPrices.set(record.itemId, record.price)
        }

        const jitaPrices = new Map<number, number>()
        for (const record of jitaRecords) {
          jitaPrices.set(record.typeId, record.price)
        }

        const esiPrices = new Map<number, EsiPriceData>()
        for (const record of esiRecords) {
          esiPrices.set(record.typeId, {
            average: record.average,
            adjusted: record.adjusted,
          })
        }

        set({
          abyssalPrices,
          jitaPrices,
          esiPrices,
          initialized: true,
        })

        logger.info('Price store initialized', {
          module: 'PriceStore',
          abyssalPrices: abyssalPrices.size,
          jitaPrices: jitaPrices.size,
          esiPrices: esiPrices.size,
        })

        if (shouldRefreshEsi()) {
          get().refreshEsiPrices()
        }

        scheduleEsiRefresh(get())
        startJitaRefreshTimer(shouldRefreshJita(), triggerJitaRefreshIfNeeded)
      } catch (err) {
        logger.error(
          'Failed to init price store',
          err instanceof Error ? err : undefined,
          { module: 'PriceStore' }
        )
        set({ initialized: true })
      }
    })()

    return initPromise
  },

  getAbyssalPrice: (itemId) => get().abyssalPrices.get(itemId),

  hasAbyssalPrice: (itemId) => get().abyssalPrices.has(itemId),

  getItemPrice: (typeId, options) => {
    if (options?.isBlueprintCopy) return 0

    if (isTypeBlueprint(typeId)) {
      return getTypeBasePrice(typeId) ?? 0
    }

    if (options?.itemId && isAbyssalTypeId(typeId)) {
      const abyssalPrice = get().abyssalPrices.get(options.itemId)
      if (abyssalPrice !== undefined && abyssalPrice > 0) {
        return abyssalPrice
      }
    }

    const marketPrice = get().marketPrices.get(typeId)
    if (marketPrice !== undefined) return marketPrice

    return get().jitaPrices.get(typeId) ?? 0
  },

  ensureJitaPrices: async (typeIds, abyssalItemIds) => {
    if (
      typeIds.length === 0 &&
      (!abyssalItemIds || abyssalItemIds.length === 0)
    ) {
      return new Map()
    }

    if (!get().initialized) {
      await get().init()
    }

    const state = get()
    const results = new Map<number, number>()
    const missingTypeIds: number[] = []
    const seenTypeIds = new Set<number>()

    for (const typeId of typeIds) {
      if (seenTypeIds.has(typeId) || isAbyssalTypeId(typeId)) continue
      seenTypeIds.add(typeId)

      const cached = state.jitaPrices.get(typeId)
      if (cached !== undefined) {
        results.set(typeId, cached)
      } else {
        missingTypeIds.push(typeId)
      }
    }

    const missingAbyssalSet = new Set<number>()
    if (abyssalItemIds) {
      for (const itemId of abyssalItemIds) {
        if (missingAbyssalSet.has(itemId) || results.has(itemId)) continue

        const cached = state.abyssalPrices.get(itemId)
        if (cached !== undefined) {
          results.set(itemId, cached)
        } else {
          missingAbyssalSet.add(itemId)
        }
      }
    }

    if (missingTypeIds.length === 0 && missingAbyssalSet.size === 0) {
      return results
    }

    const missingAbyssalIds = Array.from(missingAbyssalSet)
    const { fetchPrices } = await import('@/api/ref-market')
    const fetched = await fetchPrices(
      missingTypeIds,
      missingAbyssalIds.length > 0 ? missingAbyssalIds : undefined
    )

    const stored = await storeAndPersistPrices(
      fetched,
      missingAbyssalSet,
      set,
      get
    )
    for (const [id, price] of stored) {
      results.set(id, price)
    }

    if (fetched.size > 0) {
      logger.info('Prices fetched (delta)', {
        module: 'PriceStore',
        requestedTypes: missingTypeIds.length,
        requestedAbyssals: missingAbyssalIds.length,
        fetched: fetched.size,
      })
    }

    return results
  },

  setAbyssalPrices: async (prices) => {
    if (prices.length === 0) return

    set((state) => {
      const merged = new Map(state.abyssalPrices)
      for (const { itemId, price } of prices) {
        merged.set(itemId, price)
      }
      return { abyssalPrices: merged }
    })

    await saveAbyssalPricesToDB(prices)
  },

  setMarketPrices: (prices) => {
    set((state) => ({
      marketPrices: prices,
      priceVersion: state.priceVersion + 1,
    }))
  },

  refreshAllJitaPrices: async (typeIds, abyssalItemIds) => {
    const hasTypeIds = typeIds.length > 0
    const hasAbyssalIds = abyssalItemIds && abyssalItemIds.length > 0
    if (!hasTypeIds && !hasAbyssalIds) return
    if (get().isUpdatingJita) return

    if (!get().initialized) {
      await get().init()
    }

    set({ isUpdatingJita: true })

    try {
      const { fetchPrices } = await import('@/api/ref-market')
      const fetched = await fetchPrices(
        typeIds,
        hasAbyssalIds ? abyssalItemIds : undefined
      )

      const abyssalIdSet = hasAbyssalIds
        ? new Set(abyssalItemIds)
        : new Set<number>()
      await storeAndPersistPrices(fetched, abyssalIdSet, set, get)

      setLastJitaRefreshAt(Date.now())

      logger.info('Prices refreshed', {
        module: 'PriceStore',
        requestedTypes: typeIds.length,
        requestedAbyssals: abyssalItemIds?.length ?? 0,
        fetched: fetched.size,
      })
    } catch (err) {
      logger.error(
        'Failed to refresh prices',
        err instanceof Error ? err : undefined,
        { module: 'PriceStore' }
      )
    } finally {
      set({ isUpdatingJita: false })
    }
  },

  refreshEsiPrices: async () => {
    const state = get()
    if (state.isUpdatingEsi) return
    if (!shouldRefreshEsi()) return

    set({ isUpdatingEsi: true })

    try {
      logger.info('Fetching ESI market prices', { module: 'PriceStore' })
      const esiData = await getMarketPrices()

      const newEsiPrices = new Map<number, EsiPriceData>()
      const recordsToSave: EsiPriceRecord[] = []

      for (const item of esiData) {
        const data: EsiPriceData = {
          average: item.average_price ?? undefined,
          adjusted: item.adjusted_price ?? undefined,
        }
        newEsiPrices.set(item.type_id, data)
        recordsToSave.push({
          typeId: item.type_id,
          average: data.average,
          adjusted: data.adjusted,
        })
      }

      await saveEsiPricesToDB(recordsToSave)

      set((s) => ({
        esiPrices: newEsiPrices,
        priceVersion: s.priceVersion + 1,
      }))

      setLastEsiRefreshAt(Date.now())

      logger.info('ESI market prices updated', {
        module: 'PriceStore',
        count: newEsiPrices.size,
      })
    } catch (err) {
      logger.error(
        'Failed to fetch ESI prices',
        err instanceof Error ? err : undefined,
        { module: 'PriceStore' }
      )
    } finally {
      set({ isUpdatingEsi: false })
    }
  },

  pruneAbyssalPrices: async (ownedAbyssalIds) => {
    const state = get()

    const prunedAbyssal = new Map<number, number>()
    for (const [itemId, price] of state.abyssalPrices) {
      if (ownedAbyssalIds.has(itemId)) {
        prunedAbyssal.set(itemId, price)
      }
    }

    const abyssalPruned = state.abyssalPrices.size - prunedAbyssal.size

    if (abyssalPruned === 0) {
      return
    }

    set({ abyssalPrices: prunedAbyssal })

    await clearAbyssalDB()

    const abyssalRecords = Array.from(prunedAbyssal.entries()).map(
      ([itemId, price]) => ({ itemId, price })
    )

    if (abyssalRecords.length > 0) {
      await saveAbyssalPricesToDB(abyssalRecords)
    }

    logger.info('Pruned orphaned abyssal prices', {
      module: 'PriceStore',
      abyssalPruned,
      abyssalRemaining: prunedAbyssal.size,
    })
  },

  clearAbyssal: async () => {
    await clearAbyssalDB()
    set({ abyssalPrices: new Map() })
    logger.info('Abyssal prices cleared', { module: 'PriceStore' })
  },

  clearJita: async () => {
    clearJitaRefreshTimestamp()
    initPromise = null
    stopPriceRefreshTimers()
    await clearJitaDB()
    set({ jitaPrices: new Map(), marketPrices: new Map(), initialized: false })
    logger.info('Jita price cache cleared', { module: 'PriceStore' })
  },

  clearEsi: async () => {
    clearEsiRefreshTimestamp()
    await clearEsiDB()
    set((s) => ({ esiPrices: new Map(), priceVersion: s.priceVersion + 1 }))
    logger.info('ESI price cache cleared', { module: 'PriceStore' })
  },

  clear: async () => {
    await clearAllPricesDB()
    clearRefreshTimestamps()
    initPromise = null
    stopPriceRefreshTimers()
    set({
      jitaPrices: new Map(),
      esiPrices: new Map(),
      abyssalPrices: new Map(),
      marketPrices: new Map(),
      isUpdatingJita: false,
      isUpdatingEsi: false,
      initialized: false,
      priceVersion: 0,
    })
    logger.info('Price store cleared', { module: 'PriceStore' })
  },
}))

export function getJitaPrice(typeId: number): number | undefined {
  return usePriceStore.getState().jitaPrices.get(typeId)
}

export function getEsiAveragePrice(typeId: number): number | undefined {
  return usePriceStore.getState().esiPrices.get(typeId)?.average
}

export function getEsiAdjustedPrice(typeId: number): number | undefined {
  return usePriceStore.getState().esiPrices.get(typeId)?.adjusted
}

useStoreRegistry.getState().register({
  name: 'prices',
  clear: usePriceStore.getState().clear,
  getIsUpdating: () => {
    const state = usePriceStore.getState()
    return state.isUpdatingJita || state.isUpdatingEsi
  },
  init: usePriceStore.getState().init,
})
