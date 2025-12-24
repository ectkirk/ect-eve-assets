import { create } from 'zustand'
import { getMarketPrices } from '@/api/endpoints/market'
import { logger } from '@/lib/logger'
import {
  openDatabase,
  idbGetAll,
  idbGet,
  idbPut,
  idbPutBatch,
  idbClearMultiple,
} from '@/lib/idb-utils'
import { getBlueprint } from '@/store/reference-cache'

const ABYSSAL_TYPE_IDS = new Set([
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

interface JitaPriceRecord {
  typeId: number
  price: number
}

interface AbyssalPriceRecord {
  itemId: number
  price: number
  fetchedAt: number
}

interface ESIPriceRecord {
  typeId: number
  averagePrice: number | null
  adjustedPrice: number | null
}

interface MetaRecord {
  key: string
  value: number
}

interface PriceState {
  jitaPrices: Map<number, number>
  abyssalPrices: Map<number, number>
  marketPrices: Map<number, number>
  esiPrices: Map<
    number,
    { averagePrice: number | null; adjustedPrice: number | null }
  >
  lastJitaRefreshAt: number | null
  lastEsiRefreshAt: number | null
  isUpdating: boolean
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
  getJitaPrice: (typeId: number) => number | undefined
  getAbyssalPrice: (itemId: number) => number | undefined
  hasAbyssalPrice: (itemId: number) => boolean
  getEsiAveragePrice: (typeId: number) => number | undefined
  getEsiAdjustedPrice: (typeId: number) => number | undefined
  ensureJitaPrices: (
    typeIds: number[],
    abyssalItemIds?: number[]
  ) => Promise<Map<number, number>>
  setJitaPrices: (prices: Map<number, number>) => Promise<void>
  setAbyssalPrices: (
    prices: Array<{ itemId: number; price: number }>
  ) => Promise<void>
  setMarketPrices: (prices: Map<number, number>) => void
  refreshAllJitaPrices: (
    typeIds: number[],
    abyssalItemIds?: number[]
  ) => Promise<void>
  refreshEsiPrices: () => Promise<void>
  pruneOrphanedPrices: (
    ownedTypeIds: Set<number>,
    ownedAbyssalIds: Set<number>
  ) => Promise<void>
  clear: () => Promise<void>
}

type PriceStore = PriceState & PriceActions

const DB_CONFIG = {
  dbName: 'ecteveassets-prices',
  version: 1,
  stores: [
    { name: 'jita', keyPath: 'typeId' },
    { name: 'abyssal', keyPath: 'itemId' },
    { name: 'esi', keyPath: 'typeId' },
    { name: 'meta', keyPath: 'key' },
  ],
  module: 'PriceStore',
}

async function getDB() {
  return openDatabase(DB_CONFIG)
}

async function loadFromDB(): Promise<{
  jitaPrices: JitaPriceRecord[]
  abyssalPrices: AbyssalPriceRecord[]
  esiPrices: ESIPriceRecord[]
  lastJitaRefreshAt: number | null
  lastEsiRefreshAt: number | null
}> {
  const db = await getDB()
  const [jitaPrices, abyssalPrices, esiPrices, jitaMeta, esiMeta] =
    await Promise.all([
      idbGetAll<JitaPriceRecord>(db, 'jita'),
      idbGetAll<AbyssalPriceRecord>(db, 'abyssal'),
      idbGetAll<ESIPriceRecord>(db, 'esi'),
      idbGet<MetaRecord>(db, 'meta', 'lastJitaRefreshAt'),
      idbGet<MetaRecord>(db, 'meta', 'lastEsiRefreshAt'),
    ])
  return {
    jitaPrices,
    abyssalPrices,
    esiPrices,
    lastJitaRefreshAt: jitaMeta?.value ?? null,
    lastEsiRefreshAt: esiMeta?.value ?? null,
  }
}

async function saveJitaPricesToDB(
  prices: Map<number, number>,
  lastRefreshAt: number
): Promise<void> {
  const db = await getDB()
  const records: JitaPriceRecord[] = Array.from(prices.entries()).map(
    ([typeId, price]) => ({
      typeId,
      price,
    })
  )
  await idbPutBatch(db, 'jita', records)
  await idbPut(db, 'meta', { key: 'lastJitaRefreshAt', value: lastRefreshAt })
}

async function saveAbyssalPricesToDB(
  prices: AbyssalPriceRecord[]
): Promise<void> {
  if (prices.length === 0) return
  const db = await getDB()
  await idbPutBatch(db, 'abyssal', prices)
}

async function saveEsiPricesToDB(
  prices: Map<
    number,
    { averagePrice: number | null; adjustedPrice: number | null }
  >,
  lastRefreshAt: number
): Promise<void> {
  const db = await getDB()
  const records: ESIPriceRecord[] = Array.from(prices.entries()).map(
    ([typeId, p]) => ({
      typeId,
      averagePrice: p.averagePrice,
      adjustedPrice: p.adjustedPrice,
    })
  )

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['esi', 'meta'], 'readwrite')
    const esiStore = tx.objectStore('esi')
    const metaStore = tx.objectStore('meta')

    esiStore.clear()
    for (const record of records) {
      esiStore.put(record)
    }
    metaStore.put({ key: 'lastEsiRefreshAt', value: lastRefreshAt })

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const db = await getDB()
  await idbClearMultiple(db, ['jita', 'abyssal', 'esi', 'meta'])
}

const JITA_REFRESH_INTERVAL_MS = 60 * 60 * 1000

function getNextWednesdayNoonGMT(): Date {
  const now = new Date()
  const utcDay = now.getUTCDay()
  const utcHour = now.getUTCHours()

  let daysUntilWednesday = (3 - utcDay + 7) % 7
  if (daysUntilWednesday === 0 && utcHour >= 12) {
    daysUntilWednesday = 7
  }

  const next = new Date(now)
  next.setUTCDate(now.getUTCDate() + daysUntilWednesday)
  next.setUTCHours(12, 0, 0, 0)
  return next
}

function shouldRefreshEsi(lastRefreshAt: number | null): boolean {
  if (!lastRefreshAt) return true
  const lastRefresh = new Date(lastRefreshAt)
  const now = new Date()
  const lastWednesday = getNextWednesdayNoonGMT()
  lastWednesday.setUTCDate(lastWednesday.getUTCDate() - 7)
  return lastRefresh < lastWednesday && now >= lastWednesday
}

let jitaRefreshInterval: ReturnType<typeof setInterval> | null = null
let esiRefreshTimer: ReturnType<typeof setTimeout> | null = null

export const usePriceStore = create<PriceStore>((set, get) => ({
  jitaPrices: new Map(),
  abyssalPrices: new Map(),
  marketPrices: new Map(),
  esiPrices: new Map(),
  lastJitaRefreshAt: null,
  lastEsiRefreshAt: null,
  isUpdating: false,
  initialized: false,
  priceVersion: 0,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await loadFromDB()

      const jitaPrices = new Map<number, number>()
      for (const record of loaded.jitaPrices) {
        jitaPrices.set(record.typeId, record.price)
      }

      const abyssalPrices = new Map<number, number>()
      for (const record of loaded.abyssalPrices) {
        abyssalPrices.set(record.itemId, record.price)
      }

      const esiPrices = new Map<
        number,
        { averagePrice: number | null; adjustedPrice: number | null }
      >()
      for (const record of loaded.esiPrices) {
        esiPrices.set(record.typeId, {
          averagePrice: record.averagePrice,
          adjustedPrice: record.adjustedPrice,
        })
      }

      set({
        jitaPrices,
        abyssalPrices,
        esiPrices,
        lastJitaRefreshAt: loaded.lastJitaRefreshAt,
        lastEsiRefreshAt: loaded.lastEsiRefreshAt,
        initialized: true,
      })

      logger.info('Price store initialized', {
        module: 'PriceStore',
        jitaPrices: jitaPrices.size,
        abyssalPrices: abyssalPrices.size,
        esiPrices: esiPrices.size,
      })

      if (shouldRefreshEsi(loaded.lastEsiRefreshAt)) {
        get().refreshEsiPrices()
      }

      scheduleEsiRefresh(get())
      startJitaRefreshTimer()
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
  },

  getJitaPrice: (typeId) => get().jitaPrices.get(typeId),

  getAbyssalPrice: (itemId) => get().abyssalPrices.get(itemId),

  hasAbyssalPrice: (itemId) => get().abyssalPrices.has(itemId),

  getItemPrice: (typeId, options) => {
    if (options?.isBlueprintCopy) return 0

    const blueprint = getBlueprint(typeId)
    if (blueprint) return blueprint.basePrice ?? 0

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

  getEsiAveragePrice: (typeId) =>
    get().esiPrices.get(typeId)?.averagePrice ?? undefined,

  getEsiAdjustedPrice: (typeId) =>
    get().esiPrices.get(typeId)?.adjustedPrice ?? undefined,

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

    const newJitaPrices = new Map(get().jitaPrices)
    const newAbyssalPrices = new Map(get().abyssalPrices)
    const abyssalRecords: AbyssalPriceRecord[] = []
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
        newJitaPrices.set(id, price)
        results.set(id, price)
      }
    }

    if (fetched.size > 0) {
      set({ jitaPrices: newJitaPrices, abyssalPrices: newAbyssalPrices })

      const jitaRecords: JitaPriceRecord[] = []
      for (const typeId of missingTypeIds) {
        const price = fetched.get(typeId)
        if (price !== undefined) {
          jitaRecords.push({ typeId, price })
        }
      }

      if (jitaRecords.length > 0) {
        const db = await getDB()
        await idbPutBatch(db, 'jita', jitaRecords)
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

  setJitaPrices: async (prices) => {
    const now = Date.now()
    const merged = new Map(get().jitaPrices)
    for (const [id, price] of prices) {
      merged.set(id, price)
    }

    set({ jitaPrices: merged, lastJitaRefreshAt: now })
    await saveJitaPricesToDB(merged, now)
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
    if (get().isUpdating) return

    if (!get().initialized) {
      await get().init()
    }

    set({ isUpdating: true })

    try {
      const { fetchPrices } = await import('@/api/ref-market')
      const fetched = await fetchPrices(
        typeIds,
        hasAbyssalIds ? abyssalItemIds : undefined
      )

      const abyssalIdSet = hasAbyssalIds ? new Set(abyssalItemIds) : new Set()
      const now = Date.now()

      const mergedJita = new Map(get().jitaPrices)
      const mergedAbyssal = new Map(get().abyssalPrices)
      const jitaRecords: JitaPriceRecord[] = []
      const abyssalRecords: AbyssalPriceRecord[] = []

      for (const [id, price] of fetched) {
        if (abyssalIdSet.has(id)) {
          const existing = mergedAbyssal.get(id)
          if (price > 0 || existing === undefined || existing <= 0) {
            mergedAbyssal.set(id, price)
            abyssalRecords.push({ itemId: id, price, fetchedAt: now })
          }
        } else {
          mergedJita.set(id, price)
          jitaRecords.push({ typeId: id, price })
        }
      }

      set({
        jitaPrices: mergedJita,
        abyssalPrices: mergedAbyssal,
        lastJitaRefreshAt: now,
        isUpdating: false,
      })

      const db = await getDB()
      if (jitaRecords.length > 0) {
        await idbPutBatch(db, 'jita', jitaRecords)
        await idbPut(db, 'meta', { key: 'lastJitaRefreshAt', value: now })
      }
      if (abyssalRecords.length > 0) {
        await idbPutBatch(db, 'abyssal', abyssalRecords)
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
      set({ isUpdating: false })
    }
  },

  refreshEsiPrices: async () => {
    const state = get()
    if (state.isUpdating) return
    if (!shouldRefreshEsi(state.lastEsiRefreshAt) && state.esiPrices.size > 0)
      return

    set({ isUpdating: true })

    try {
      logger.info('Fetching ESI market prices', { module: 'PriceStore' })
      const esiData = await getMarketPrices()

      const esiPrices = new Map<
        number,
        { averagePrice: number | null; adjustedPrice: number | null }
      >()
      for (const item of esiData) {
        esiPrices.set(item.type_id, {
          averagePrice: item.average_price ?? null,
          adjustedPrice: item.adjusted_price ?? null,
        })
      }

      const now = Date.now()
      await saveEsiPricesToDB(esiPrices, now)
      set({ esiPrices, lastEsiRefreshAt: now, isUpdating: false })

      logger.info('ESI market prices updated', {
        module: 'PriceStore',
        count: esiPrices.size,
      })
    } catch (err) {
      logger.error(
        'Failed to fetch ESI prices',
        err instanceof Error ? err : undefined,
        {
          module: 'PriceStore',
        }
      )
      set({ isUpdating: false })
    }
  },

  pruneOrphanedPrices: async (ownedTypeIds, ownedAbyssalIds) => {
    const state = get()

    const prunedJita = new Map<number, number>()
    for (const [typeId, price] of state.jitaPrices) {
      if (ownedTypeIds.has(typeId)) {
        prunedJita.set(typeId, price)
      }
    }

    const prunedAbyssal = new Map<number, number>()
    for (const [itemId, price] of state.abyssalPrices) {
      if (ownedAbyssalIds.has(itemId)) {
        prunedAbyssal.set(itemId, price)
      }
    }

    const jitaPruned = state.jitaPrices.size - prunedJita.size
    const abyssalPruned = state.abyssalPrices.size - prunedAbyssal.size

    if (jitaPruned === 0 && abyssalPruned === 0) {
      return
    }

    set({ jitaPrices: prunedJita, abyssalPrices: prunedAbyssal })

    const db = await getDB()
    await idbClearMultiple(db, ['jita', 'abyssal'])

    const jitaRecords = Array.from(prunedJita.entries()).map(
      ([typeId, price]) => ({ typeId, price })
    )
    const now = Date.now()
    const abyssalRecords = Array.from(prunedAbyssal.entries()).map(
      ([itemId, price]) => ({ itemId, price, fetchedAt: now })
    )

    if (jitaRecords.length > 0) {
      await idbPutBatch(db, 'jita', jitaRecords)
    }
    if (abyssalRecords.length > 0) {
      await idbPutBatch(db, 'abyssal', abyssalRecords)
    }

    logger.info('Pruned orphaned prices', {
      module: 'PriceStore',
      jitaPruned,
      abyssalPruned,
      jitaRemaining: prunedJita.size,
      abyssalRemaining: prunedAbyssal.size,
    })
  },

  clear: async () => {
    await clearDB()
    set({
      jitaPrices: new Map(),
      abyssalPrices: new Map(),
      marketPrices: new Map(),
      esiPrices: new Map(),
      lastJitaRefreshAt: null,
      lastEsiRefreshAt: null,
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

  const nextUpdate = getNextWednesdayNoonGMT()
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

function startJitaRefreshTimer(): void {
  if (jitaRefreshInterval) return

  jitaRefreshInterval = setInterval(async () => {
    const { useExpiryCacheStore } = await import('./expiry-cache-store')
    const { useAssetStore } = await import('./asset-store')
    const { collectOwnedIds } = await import('./type-id-collector')
    const { useContractsStore } = await import('./contracts-store')
    const { useMarketOrdersStore } = await import('./market-orders-store')
    const { useIndustryJobsStore } = await import('./industry-jobs-store')
    const { useStructuresStore } = await import('./structures-store')

    const state = usePriceStore.getState()
    if (!state.initialized || state.isUpdating) return
    if (useExpiryCacheStore.getState().isPaused) return

    const { typeIds, abyssalItemIds } = collectOwnedIds(
      useAssetStore.getState().assetsByOwner,
      useMarketOrdersStore.getOrdersByOwner(),
      useContractsStore.getContractsByOwner(),
      useIndustryJobsStore.getJobsByOwner(),
      useStructuresStore.getState().dataByOwner
    )

    if (typeIds.size > 0 || abyssalItemIds.size > 0) {
      logger.info('Hourly price refresh triggered', { module: 'PriceStore' })
      await state.refreshAllJitaPrices(
        Array.from(typeIds),
        Array.from(abyssalItemIds)
      )
    }

    await state.pruneOrphanedPrices(typeIds, abyssalItemIds)
  }, JITA_REFRESH_INTERVAL_MS)
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
