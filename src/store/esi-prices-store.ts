import { create } from 'zustand'
import { getMarketPrices } from '@/api/endpoints/market'
import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-esi-prices'
const DB_VERSION = 1
const STORE_PRICES = 'prices'
const STORE_META = 'meta'

interface ESIPriceRecord {
  typeId: number
  averagePrice: number | null
  adjustedPrice: number | null
}

interface ESIPricesState {
  prices: Map<number, { averagePrice: number | null; adjustedPrice: number | null }>
  lastUpdateAt: number | null
  isUpdating: boolean
  initialized: boolean
}

interface ESIPricesActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  getAveragePrice: (typeId: number) => number | null
  getAdjustedPrice: (typeId: number) => number | null
  clear: () => Promise<void>
}

type ESIPricesStore = ESIPricesState & ESIPricesActions

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open ESI prices DB', request.error, { module: 'ESIPricesStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_PRICES)) {
        database.createObjectStore(STORE_PRICES, { keyPath: 'typeId' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<{ prices: ESIPriceRecord[]; lastUpdateAt: number | null }> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_PRICES, STORE_META], 'readonly')
    const pricesStore = tx.objectStore(STORE_PRICES)
    const metaStore = tx.objectStore(STORE_META)

    const prices: ESIPriceRecord[] = []
    let lastUpdateAt: number | null = null

    const pricesReq = pricesStore.openCursor()
    pricesReq.onsuccess = () => {
      const cursor = pricesReq.result
      if (cursor) {
        prices.push(cursor.value as ESIPriceRecord)
        cursor.continue()
      }
    }

    const metaReq = metaStore.get('lastUpdateAt')
    metaReq.onsuccess = () => {
      if (metaReq.result) {
        lastUpdateAt = metaReq.result.value
      }
    }

    tx.oncomplete = () => resolve({ prices, lastUpdateAt })
    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(
  prices: Map<number, { averagePrice: number | null; adjustedPrice: number | null }>,
  lastUpdateAt: number
): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_PRICES, STORE_META], 'readwrite')
    const pricesStore = tx.objectStore(STORE_PRICES)
    const metaStore = tx.objectStore(STORE_META)

    pricesStore.clear()

    for (const [typeId, price] of prices) {
      pricesStore.put({
        typeId,
        averagePrice: price.averagePrice,
        adjustedPrice: price.adjustedPrice,
      })
    }

    metaStore.put({ key: 'lastUpdateAt', value: lastUpdateAt })

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_PRICES, STORE_META], 'readwrite')
    tx.objectStore(STORE_PRICES).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

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

function shouldUpdate(lastUpdateAt: number | null): boolean {
  if (!lastUpdateAt) return true

  const lastUpdate = new Date(lastUpdateAt)
  const now = new Date()

  const lastWednesday = getNextWednesdayNoonGMT()
  lastWednesday.setUTCDate(lastWednesday.getUTCDate() - 7)

  return lastUpdate < lastWednesday && now >= lastWednesday
}

let updateTimer: ReturnType<typeof setTimeout> | null = null

function scheduleNextUpdate(store: ESIPricesStore): void {
  if (updateTimer) {
    clearTimeout(updateTimer)
  }

  const nextUpdate = getNextWednesdayNoonGMT()
  const msUntilUpdate = nextUpdate.getTime() - Date.now()

  const maxTimeout = 2147483647
  if (msUntilUpdate > maxTimeout) {
    updateTimer = setTimeout(() => scheduleNextUpdate(store), maxTimeout)
    return
  }

  logger.info('ESI prices update scheduled', {
    module: 'ESIPricesStore',
    nextUpdate: nextUpdate.toISOString(),
    msUntilUpdate,
  })

  updateTimer = setTimeout(() => {
    store.update(true)
    scheduleNextUpdate(store)
  }, msUntilUpdate)
}

export const useESIPricesStore = create<ESIPricesStore>((set, get) => ({
  prices: new Map(),
  lastUpdateAt: null,
  isUpdating: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { prices: records, lastUpdateAt } = await loadFromDB()

      const prices = new Map<number, { averagePrice: number | null; adjustedPrice: number | null }>()
      for (const record of records) {
        prices.set(record.typeId, {
          averagePrice: record.averagePrice,
          adjustedPrice: record.adjustedPrice,
        })
      }

      set({ prices, lastUpdateAt, initialized: true })

      logger.info('ESI prices store initialized', {
        module: 'ESIPricesStore',
        count: prices.size,
        lastUpdateAt: lastUpdateAt ? new Date(lastUpdateAt).toISOString() : null,
      })

      if (shouldUpdate(lastUpdateAt)) {
        get().update()
      }

      scheduleNextUpdate(get())
    } catch (err) {
      logger.error('Failed to init ESI prices store', err instanceof Error ? err : undefined, {
        module: 'ESIPricesStore',
      })
      set({ initialized: true })
    }
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return
    if (!force && !shouldUpdate(state.lastUpdateAt)) return

    set({ isUpdating: true })

    try {
      logger.info('Fetching ESI market prices', { module: 'ESIPricesStore' })
      const esiPrices = await getMarketPrices()

      const prices = new Map<number, { averagePrice: number | null; adjustedPrice: number | null }>()
      for (const item of esiPrices) {
        prices.set(item.type_id, {
          averagePrice: item.average_price ?? null,
          adjustedPrice: item.adjusted_price ?? null,
        })
      }

      const now = Date.now()
      await saveToDB(prices, now)

      set({ prices, lastUpdateAt: now, isUpdating: false })

      logger.info('ESI market prices updated', {
        module: 'ESIPricesStore',
        count: prices.size,
      })
    } catch (err) {
      logger.error('Failed to fetch ESI prices', err instanceof Error ? err : undefined, {
        module: 'ESIPricesStore',
      })
      set({ isUpdating: false })
    }
  },

  getAveragePrice: (typeId: number) => {
    return get().prices.get(typeId)?.averagePrice ?? null
  },

  getAdjustedPrice: (typeId: number) => {
    return get().prices.get(typeId)?.adjustedPrice ?? null
  },

  clear: async () => {
    try {
      await clearDB()
      set({ prices: new Map(), lastUpdateAt: null })
      logger.info('ESI prices store cleared', { module: 'ESIPricesStore' })
    } catch (err) {
      logger.error('Failed to clear ESI prices store', err instanceof Error ? err : undefined, {
        module: 'ESIPricesStore',
      })
    }
  },
}))
