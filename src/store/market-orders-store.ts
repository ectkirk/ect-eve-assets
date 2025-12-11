import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esiClient, type ESIResponseMeta } from '@/api/esi-client'
import {
  ESIMarketOrderSchema,
  ESICorporationMarketOrderSchema,
} from '@/api/schemas'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const DB_NAME = 'ecteveassets-market-orders'
const DB_VERSION = 2
const STORE_ORDERS = 'orders'
const STORE_META = 'meta'

export type ESIMarketOrder = z.infer<typeof ESIMarketOrderSchema>
export type ESICorporationMarketOrder = z.infer<typeof ESICorporationMarketOrderSchema>
export type MarketOrder = ESIMarketOrder | ESICorporationMarketOrder

export interface OwnerOrders {
  owner: Owner
  orders: MarketOrder[]
}

interface StoredOwnerOrders {
  ownerKey: string
  owner: Owner
  orders: MarketOrder[]
}

interface MarketOrdersState {
  ordersByOwner: OwnerOrders[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface MarketOrdersActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type MarketOrdersStore = MarketOrdersState & MarketOrdersActions

let db: IDBDatabase | null = null

function getOrdersEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/orders/`
  }
  return `/characters/${owner.characterId}/orders/`
}

async function fetchOwnerOrdersWithMeta(owner: Owner): Promise<ESIResponseMeta<MarketOrder[]>> {
  const endpoint = getOrdersEndpoint(owner)
  if (owner.type === 'corporation') {
    return esiClient.fetchWithPaginationMeta<ESICorporationMarketOrder>(endpoint, {
      characterId: owner.characterId,
      schema: ESICorporationMarketOrderSchema,
    })
  }
  return esiClient.fetchWithPaginationMeta<ESIMarketOrder>(endpoint, {
    characterId: owner.characterId,
    schema: ESIMarketOrderSchema,
  })
}

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

async function loadFromDB(): Promise<{ ordersByOwner: OwnerOrders[] }> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS], 'readonly')
    const ordersStore = tx.objectStore(STORE_ORDERS)

    const ordersByOwner: OwnerOrders[] = []
    const ordersRequest = ordersStore.getAll()

    tx.oncomplete = () => {
      for (const stored of ordersRequest.result as StoredOwnerOrders[]) {
        ordersByOwner.push({ owner: stored.owner, orders: stored.orders })
      }
      resolve({ ordersByOwner })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(ordersByOwner: OwnerOrders[]): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS], 'readwrite')
    const ordersStore = tx.objectStore(STORE_ORDERS)

    ordersStore.clear()
    for (const { owner, orders } of ordersByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      ordersStore.put({ ownerKey, owner, orders } as StoredOwnerOrders)
    }

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
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { ordersByOwner } = await loadFromDB()
      set({ ordersByOwner, initialized: true })
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

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? owners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : owners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getOrdersEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need market orders update', { module: 'MarketOrdersStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingOrders = new Map(
        state.ordersByOwner.map((oo) => [`${oo.owner.type}-${oo.owner.id}`, oo])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getOrdersEndpoint(owner)

        try {
          logger.info('Fetching market orders', { module: 'MarketOrdersStore', owner: owner.name })
          const { data: orders, expiresAt, etag } = await fetchOwnerOrdersWithMeta(owner)

          existingOrders.set(ownerKey, { owner, orders })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)
        } catch (err) {
          logger.error('Failed to fetch market orders', err instanceof Error ? err : undefined, {
            module: 'MarketOrdersStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingOrders.values()).map((ownerOrders) => {
        if (ownerOrders.owner.type === 'character') {
          const filtered = ownerOrders.orders.filter(
            (order) => !('is_corporation' in order && order.is_corporation)
          )
          return { ...ownerOrders, orders: filtered }
        }
        return ownerOrders
      })

      await saveToDB(results)

      set({
        ordersByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any orders' : null,
      })

      logger.info('Market orders updated', {
        module: 'MarketOrdersStore',
        owners: ownersToUpdate.length,
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
    const state = get()

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getOrdersEndpoint(owner)

      logger.info('Fetching market orders for owner', { module: 'MarketOrdersStore', owner: owner.name })
      const { data: orders, expiresAt, etag } = await fetchOwnerOrdersWithMeta(owner)

      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)

      const updated = state.ordersByOwner.filter(
        (oo) => `${oo.owner.type}-${oo.owner.id}` !== ownerKey
      )
      updated.push({ owner, orders })

      await saveToDB(updated)

      set({ ordersByOwner: updated })

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

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.ordersByOwner.filter(
      (oo) => `${oo.owner.type}-${oo.owner.id}` !== ownerKey
    )

    if (updated.length === state.ordersByOwner.length) return

    await saveToDB(updated)
    set({ ordersByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Market orders removed for owner', { module: 'MarketOrdersStore', ownerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      ordersByOwner: [],
      updateError: null,
    })
  },
}))
