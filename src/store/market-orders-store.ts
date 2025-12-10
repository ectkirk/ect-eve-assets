import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { getCharacterOrders, type ESIMarketOrder } from '@/api/endpoints/market'
import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-market-orders'
const DB_VERSION = 1
const STORE_ORDERS = 'orders'
const STORE_META = 'meta'

export interface OwnerOrders {
  owner: Owner
  orders: ESIMarketOrder[]
}

interface StoredOwnerOrders {
  ownerKey: string
  owner: Owner
  orders: ESIMarketOrder[]
}

interface MarketOrdersState {
  ordersByOwner: OwnerOrders[]
  lastUpdated: number | null
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

const UPDATE_COOLDOWN_MS = 5 * 60 * 1000

interface MarketOrdersActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
}

type MarketOrdersStore = MarketOrdersState & MarketOrdersActions

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open market orders DB', request.error, { module: 'MarketOrdersStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_ORDERS)) {
        database.createObjectStore(STORE_ORDERS, { keyPath: 'ownerKey' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<{
  ordersByOwner: OwnerOrders[]
  lastUpdated: number | null
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS, STORE_META], 'readonly')
    const ordersStore = tx.objectStore(STORE_ORDERS)
    const metaStore = tx.objectStore(STORE_META)

    const ordersByOwner: OwnerOrders[] = []
    const ordersRequest = ordersStore.getAll()
    const metaRequest = metaStore.getAll()

    tx.oncomplete = () => {
      for (const stored of ordersRequest.result as StoredOwnerOrders[]) {
        ordersByOwner.push({ owner: stored.owner, orders: stored.orders })
      }

      let lastUpdated: number | null = null
      for (const meta of metaRequest.result) {
        if (meta.key === 'lastUpdated') lastUpdated = meta.value
      }

      resolve({ ordersByOwner, lastUpdated })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(ordersByOwner: OwnerOrders[], lastUpdated: number): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS, STORE_META], 'readwrite')
    const ordersStore = tx.objectStore(STORE_ORDERS)
    const metaStore = tx.objectStore(STORE_META)

    ordersStore.clear()
    for (const { owner, orders } of ordersByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      ordersStore.put({ ownerKey, owner, orders } as StoredOwnerOrders)
    }

    metaStore.put({ key: 'lastUpdated', value: lastUpdated })

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS, STORE_META], 'readwrite')
    tx.objectStore(STORE_ORDERS).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useMarketOrdersStore = create<MarketOrdersStore>((set, get) => ({
  ordersByOwner: [],
  lastUpdated: null,
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { ordersByOwner, lastUpdated } = await loadFromDB()
      set({ ordersByOwner, lastUpdated, initialized: true })
      logger.info('Market orders store initialized', {
        module: 'MarketOrdersStore',
        owners: ordersByOwner.length,
        orders: ordersByOwner.reduce((sum, o) => sum + o.orders.length, 0),
      })
    } catch (err) {
      logger.error('Failed to load market orders from DB', err instanceof Error ? err : undefined, {
        module: 'MarketOrdersStore',
      })
      set({ initialized: true })
    }
  },

  canUpdate: () => {
    const { lastUpdated, isUpdating } = get()
    if (isUpdating) return false
    if (!lastUpdated) return true
    return Date.now() - lastUpdated >= UPDATE_COOLDOWN_MS
  },

  getTimeUntilUpdate: () => {
    const { lastUpdated } = get()
    if (!lastUpdated) return 0
    const elapsed = Date.now() - lastUpdated
    const remaining = UPDATE_COOLDOWN_MS - elapsed
    return remaining > 0 ? remaining : 0
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    if (!force && state.lastUpdated && Date.now() - state.lastUpdated < UPDATE_COOLDOWN_MS) {
      const minutes = Math.ceil((UPDATE_COOLDOWN_MS - (Date.now() - state.lastUpdated)) / 60000)
      set({ updateError: `Update available in ${minutes} minute${minutes === 1 ? '' : 's'}` })
      return
    }

    const owners = Object.values(useAuthStore.getState().owners).filter(
      (o) => o.type === 'character'
    )
    if (owners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const results: OwnerOrders[] = []

      for (const owner of owners) {
        try {
          logger.info('Fetching market orders', { module: 'MarketOrdersStore', owner: owner.name })
          const orders = await getCharacterOrders(owner.characterId)
          results.push({ owner, orders })
        } catch (err) {
          logger.error('Failed to fetch market orders', err instanceof Error ? err : undefined, {
            module: 'MarketOrdersStore',
            owner: owner.name,
          })
        }
      }

      const lastUpdated = Date.now()
      await saveToDB(results, lastUpdated)

      set({
        ordersByOwner: results,
        lastUpdated,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any orders' : null,
      })

      logger.info('Market orders updated', {
        module: 'MarketOrdersStore',
        owners: results.length,
        totalOrders: results.reduce((sum, r) => sum + r.orders.length, 0),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Market orders update failed', err instanceof Error ? err : undefined, {
        module: 'MarketOrdersStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    if (owner.type !== 'character') return

    const state = get()
    try {
      logger.info('Fetching market orders for new owner', { module: 'MarketOrdersStore', owner: owner.name })
      const orders = await getCharacterOrders(owner.characterId)

      const ownerKey = `${owner.type}-${owner.id}`
      const updated = state.ordersByOwner.filter(
        (oo) => `${oo.owner.type}-${oo.owner.id}` !== ownerKey
      )
      updated.push({ owner, orders })

      const lastUpdated = Date.now()
      await saveToDB(updated, lastUpdated)

      set({ ordersByOwner: updated, lastUpdated })

      logger.info('Market orders updated for owner', {
        module: 'MarketOrdersStore',
        owner: owner.name,
        orders: orders.length,
      })
    } catch (err) {
      logger.error('Failed to fetch market orders for owner', err instanceof Error ? err : undefined, {
        module: 'MarketOrdersStore',
        owner: owner.name,
      })
    }
  },

  clear: async () => {
    await clearDB()
    set({
      ordersByOwner: [],
      lastUpdated: null,
      updateError: null,
    })
  },
}))
