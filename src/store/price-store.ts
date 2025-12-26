import { create } from 'zustand'
import { getMarketPrices } from '@/api/endpoints/market'
import { logger } from '@/lib/logger'
import {
  openDatabase,
  idbGetAll,
  idbPutBatch,
  idbClearMultiple,
} from '@/lib/idb-utils'
import {
  getTypeBasePrice,
  getTypeJitaPrice,
  getTypeEsiAveragePrice,
  getTypeEsiAdjustedPrice,
  updateTypePrices,
  updateTypeEsiPrices,
  isTypeBlueprint,
} from '@/store/reference-cache'
import { useStoreRegistry } from '@/store/store-registry'

/**
 * Type IDs for abyssal (mutaplasmid-modified) modules.
 * These require per-item pricing since each is unique.
 */
export const ABYSSAL_TYPE_IDS = new Set([
  56305, 47757, 47753, 47749, 56306, 47745, 47408, 47740, 52230, 49738, 52227,
  90483, 90498, 49734, 90593, 90529, 49730, 49726, 90524, 90502, 49722, 90460,
  90474, 90487, 90467, 56313, 47702, 90493, 78621, 47736, 47732, 56308, 56310,
  56307, 56312, 56311, 56309, 47832, 48427, 56304, 56303, 47846, 47838, 47820,
  47777, 48439, 84434, 84436, 84435, 84437, 47789, 47808, 47844, 47836, 47817,
  47773, 48435, 84438, 47828, 48423, 84440, 84439, 84441, 47785, 47804, 60482,
  60483, 47842, 47812, 47769, 48431, 84442, 47824, 48419, 84444, 84443, 84445,
  47781, 47800, 47840, 47793, 60480, 60478, 60479, 90622, 90621, 90618, 90614,
  60481,
])

export function isAbyssalTypeId(typeId: number): boolean {
  return ABYSSAL_TYPE_IDS.has(typeId)
}

/**
 * Abyssal price storage record.
 *
 * Price semantics:
 * - `> 0`: Valid estimated price from Mutamarket
 * - `0`: Ref API returned no price (will re-fetch from Mutamarket on manual sync)
 * - `-1`: Mutamarket returned 404 or 0 (won't re-fetch)
 * - `undefined` (not in cache): Never fetched
 */
interface AbyssalPriceRecord {
  itemId: number
  price: number
  fetchedAt: number
}

interface PriceState {
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
  clear: () => Promise<void>
}

type PriceStore = PriceState & PriceActions

const DB_CONFIG = {
  dbName: 'ecteveassets-prices',
  version: 2,
  stores: [{ name: 'abyssal', keyPath: 'itemId' }],
  module: 'PriceStore',
}

const JITA_REFRESH_KEY = 'ecteveassets-jita-refresh-at'
const ESI_REFRESH_KEY = 'ecteveassets-esi-refresh-at'

function getLastJitaRefreshAt(): number | null {
  try {
    const value = localStorage.getItem(JITA_REFRESH_KEY)
    return value ? Number(value) : null
  } catch {
    return null
  }
}

function setLastJitaRefreshAt(timestamp: number): void {
  try {
    localStorage.setItem(JITA_REFRESH_KEY, String(timestamp))
  } catch (err) {
    logger.warn('localStorage not available for Jita refresh timestamp', {
      module: 'PriceStore',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function getLastEsiRefreshAt(): number | null {
  try {
    const value = localStorage.getItem(ESI_REFRESH_KEY)
    return value ? Number(value) : null
  } catch {
    return null
  }
}

function setLastEsiRefreshAt(timestamp: number): void {
  try {
    localStorage.setItem(ESI_REFRESH_KEY, String(timestamp))
  } catch (err) {
    logger.warn('localStorage not available for ESI refresh timestamp', {
      module: 'PriceStore',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function clearRefreshTimestamps(): void {
  try {
    localStorage.removeItem(JITA_REFRESH_KEY)
    localStorage.removeItem(ESI_REFRESH_KEY)
  } catch (err) {
    logger.warn('localStorage not available for clearing refresh timestamps', {
      module: 'PriceStore',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function getDB() {
  return openDatabase(DB_CONFIG)
}

async function loadAbyssalPricesFromDB(): Promise<AbyssalPriceRecord[]> {
  const db = await getDB()
  return idbGetAll<AbyssalPriceRecord>(db, 'abyssal')
}

async function saveAbyssalPricesToDB(
  prices: AbyssalPriceRecord[]
): Promise<void> {
  if (prices.length === 0) return
  const db = await getDB()
  await idbPutBatch(db, 'abyssal', prices)
}

async function clearAbyssalDB(): Promise<void> {
  const db = await getDB()
  await idbClearMultiple(db, ['abyssal'])
}

const JITA_REFRESH_INTERVAL_MS = 60 * 60 * 1000

function getNextWednesday8amGMT(): Date {
  const now = new Date()
  const utcDay = now.getUTCDay()
  const utcHour = now.getUTCHours()

  let daysUntilWednesday = (3 - utcDay + 7) % 7
  if (daysUntilWednesday === 0 && utcHour >= 8) {
    daysUntilWednesday = 7
  }

  const next = new Date(now)
  next.setUTCDate(now.getUTCDate() + daysUntilWednesday)
  next.setUTCHours(8, 0, 0, 0)
  return next
}

function shouldRefreshEsi(): boolean {
  const lastRefreshAt = getLastEsiRefreshAt()
  if (!lastRefreshAt) return true
  const lastRefresh = new Date(lastRefreshAt)
  const now = new Date()
  const lastWednesday = getNextWednesday8amGMT()
  lastWednesday.setUTCDate(lastWednesday.getUTCDate() - 7)
  return lastRefresh < lastWednesday && now >= lastWednesday
}

function shouldRefreshJita(): boolean {
  const lastRefreshAt = getLastJitaRefreshAt()
  if (!lastRefreshAt) return true
  return Date.now() - lastRefreshAt > JITA_REFRESH_INTERVAL_MS
}

let jitaRefreshInterval: ReturnType<typeof setInterval> | null = null
let esiRefreshTimer: ReturnType<typeof setTimeout> | null = null
let initPromise: Promise<void> | null = null

export const usePriceStore = create<PriceStore>((set, get) => ({
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
        const abyssalRecords = await loadAbyssalPricesFromDB()

        const abyssalPrices = new Map<number, number>()
        for (const record of abyssalRecords) {
          abyssalPrices.set(record.itemId, record.price)
        }

        set({
          abyssalPrices,
          initialized: true,
        })

        logger.info('Price store initialized', {
          module: 'PriceStore',
          abyssalPrices: abyssalPrices.size,
        })

        if (shouldRefreshEsi()) {
          get().refreshEsiPrices()
        }

        scheduleEsiRefresh(get())
        startJitaRefreshTimer(shouldRefreshJita())
      } catch (err) {
        logger.error(
          'Failed to init price store',
          err instanceof Error ? err : undefined,
          {
            module: 'PriceStore',
          }
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

    return getTypeJitaPrice(typeId) ?? 0
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
      if (seenTypeIds.has(typeId)) continue
      seenTypeIds.add(typeId)

      const cached = getTypeJitaPrice(typeId)
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

    const newAbyssalPrices = new Map(get().abyssalPrices)
    const abyssalRecords: AbyssalPriceRecord[] = []
    const jitaPriceUpdates: Array<{ id: number; jitaPrice: number }> = []
    const now = Date.now()

    for (const [id, price] of fetched) {
      if (missingAbyssalSet.has(id)) {
        const existing = newAbyssalPrices.get(id)
        if (price > 0 || existing === undefined || existing <= 0) {
          newAbyssalPrices.set(id, price)
          abyssalRecords.push({ itemId: id, price, fetchedAt: now })
        }
        if (price > 0) {
          results.set(id, price)
        }
      } else {
        jitaPriceUpdates.push({ id, jitaPrice: price })
        results.set(id, price)
      }
    }

    if (fetched.size > 0) {
      set({ abyssalPrices: newAbyssalPrices })

      if (jitaPriceUpdates.length > 0) {
        await updateTypePrices(jitaPriceUpdates)
      }

      if (abyssalRecords.length > 0) {
        await saveAbyssalPricesToDB(abyssalRecords)
      }

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

    const state = get()
    const merged = new Map(state.abyssalPrices)
    const records: AbyssalPriceRecord[] = []
    const now = Date.now()

    for (const { itemId, price } of prices) {
      merged.set(itemId, price)
      records.push({ itemId, price, fetchedAt: now })
    }

    set({ abyssalPrices: merged })
    await saveAbyssalPricesToDB(records)
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

      const abyssalIdSet = hasAbyssalIds ? new Set(abyssalItemIds) : new Set()
      const now = Date.now()

      const mergedAbyssal = new Map(get().abyssalPrices)
      const jitaPriceUpdates: Array<{ id: number; jitaPrice: number }> = []
      const abyssalRecords: AbyssalPriceRecord[] = []

      for (const [id, price] of fetched) {
        if (abyssalIdSet.has(id)) {
          const existing = mergedAbyssal.get(id)
          if (price > 0 || existing === undefined || existing <= 0) {
            mergedAbyssal.set(id, price)
            abyssalRecords.push({ itemId: id, price, fetchedAt: now })
          }
        } else {
          jitaPriceUpdates.push({ id, jitaPrice: price })
        }
      }

      set({
        abyssalPrices: mergedAbyssal,
        isUpdatingJita: false,
      })

      setLastJitaRefreshAt(now)

      if (jitaPriceUpdates.length > 0) {
        await updateTypePrices(jitaPriceUpdates)
      }
      if (abyssalRecords.length > 0) {
        await saveAbyssalPricesToDB(abyssalRecords)
      }

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

      const esiPriceUpdates: Array<{
        id: number
        esiAveragePrice: number | null
        esiAdjustedPrice: number | null
      }> = []

      for (const item of esiData) {
        esiPriceUpdates.push({
          id: item.type_id,
          esiAveragePrice: item.average_price ?? null,
          esiAdjustedPrice: item.adjusted_price ?? null,
        })
      }

      const now = Date.now()
      await updateTypeEsiPrices(esiPriceUpdates)
      setLastEsiRefreshAt(now)
      set({ isUpdatingEsi: false })

      logger.info('ESI market prices updated', {
        module: 'PriceStore',
        count: esiPriceUpdates.length,
      })
    } catch (err) {
      logger.error(
        'Failed to fetch ESI prices',
        err instanceof Error ? err : undefined,
        {
          module: 'PriceStore',
        }
      )
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

    const now = Date.now()
    const abyssalRecords = Array.from(prunedAbyssal.entries()).map(
      ([itemId, price]) => ({ itemId, price, fetchedAt: now })
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

  clear: async () => {
    await clearAbyssalDB()
    clearRefreshTimestamps()
    initPromise = null
    stopPriceRefreshTimers()
    set({
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

function scheduleEsiRefresh(store: PriceStore): void {
  if (esiRefreshTimer) {
    clearTimeout(esiRefreshTimer)
  }

  const nextUpdate = getNextWednesday8amGMT()
  const msUntilUpdate = nextUpdate.getTime() - Date.now()
  const maxTimeout = 2147483647

  if (msUntilUpdate > maxTimeout) {
    esiRefreshTimer = setTimeout(() => scheduleEsiRefresh(store), maxTimeout)
    return
  }

  logger.info('ESI prices update scheduled', {
    module: 'PriceStore',
    nextUpdate: nextUpdate.toISOString(),
  })

  esiRefreshTimer = setTimeout(() => {
    store.refreshEsiPrices()
    scheduleEsiRefresh(store)
  }, msUntilUpdate)
}

async function triggerJitaRefreshIfNeeded(): Promise<void> {
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
}

function startJitaRefreshTimer(triggerImmediateIfStale: boolean): void {
  if (jitaRefreshInterval) return

  if (triggerImmediateIfStale) {
    triggerJitaRefreshIfNeeded()
  }

  jitaRefreshInterval = setInterval(
    triggerJitaRefreshIfNeeded,
    JITA_REFRESH_INTERVAL_MS
  )
}

export function stopPriceRefreshTimers(): void {
  if (jitaRefreshInterval) {
    clearInterval(jitaRefreshInterval)
    jitaRefreshInterval = null
  }
  if (esiRefreshTimer) {
    clearTimeout(esiRefreshTimer)
    esiRefreshTimer = null
  }
}

export function getJitaPrice(typeId: number): number | undefined {
  return getTypeJitaPrice(typeId)
}

export function getEsiAveragePrice(typeId: number): number | undefined {
  return getTypeEsiAveragePrice(typeId)
}

export function getEsiAdjustedPrice(typeId: number): number | undefined {
  return getTypeEsiAdjustedPrice(typeId)
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
