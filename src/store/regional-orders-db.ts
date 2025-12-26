import { logger } from '@/lib/logger'
import type { ESIRegionOrder } from '@/api/endpoints/market'

const DB_NAME = 'ecteveassets-regional-orders'
const DB_VERSION = 1
const STORE_ORDERS = 'orders'
const MODULE = 'RegionalOrdersDB'

export interface StoredRegionOrders {
  regionId: number
  orders: ESIRegionOrder[]
  fetchedAt: number
  expiresAt: number
}

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open regional orders DB', request.error, {
        module: MODULE,
      })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_ORDERS)) {
        database.createObjectStore(STORE_ORDERS, { keyPath: 'regionId' })
      }
    }
  })
}

export async function loadAllOrdersFromDB(): Promise<StoredRegionOrders[]> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS], 'readonly')
    const store = tx.objectStore(STORE_ORDERS)
    const request = store.getAll()

    tx.oncomplete = () => {
      resolve(request.result as StoredRegionOrders[])
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function saveOrdersToDB(
  record: StoredRegionOrders
): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS], 'readwrite')
    const store = tx.objectStore(STORE_ORDERS)
    store.put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteRegionsFromDB(regionIds: number[]): Promise<void> {
  if (regionIds.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS], 'readwrite')
    const store = tx.objectStore(STORE_ORDERS)
    for (const regionId of regionIds) {
      store.delete(regionId)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearOrdersDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS], 'readwrite')
    tx.objectStore(STORE_ORDERS).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
