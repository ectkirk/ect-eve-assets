import { logger } from '@/lib/logger'

interface IDBConfig {
  dbName: string
  version: number
  stores: {
    name: string
    keyPath: string
  }[]
  module: string
}

const dbCache = new Map<string, IDBDatabase>()

export async function openDatabase(config: IDBConfig): Promise<IDBDatabase> {
  const cached = dbCache.get(config.dbName)
  if (cached) return cached

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(config.dbName, config.version)

    request.onerror = () => {
      logger.error(`Failed to open ${config.dbName} DB`, request.error, {
        module: config.module,
      })
      reject(request.error)
    }

    request.onsuccess = () => {
      dbCache.set(config.dbName, request.result)
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      for (const store of config.stores) {
        if (!database.objectStoreNames.contains(store.name)) {
          database.createObjectStore(store.name, { keyPath: store.keyPath })
        }
      }
    }
  })
}

export async function idbGetAll<T>(
  db: IDBDatabase,
  storeName: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    tx.oncomplete = () => resolve(request.result as T[])
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbGet<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)

    tx.oncomplete = () => resolve(request.result as T | undefined)
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbPut<T>(
  db: IDBDatabase,
  storeName: string,
  item: T
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    const store = tx.objectStore(storeName)
    store.put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbPutBatch<T>(
  db: IDBDatabase,
  storeName: string,
  items: T[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    const store = tx.objectStore(storeName)
    for (const item of items) {
      store.put(item)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbDelete(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbClear(
  db: IDBDatabase,
  storeName: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    tx.objectStore(storeName).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbClearMultiple(
  db: IDBDatabase,
  storeNames: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite')
    for (const name of storeNames) {
      tx.objectStore(name).clear()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
