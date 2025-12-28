import { logger } from '@/lib/logger'
import type { DBConfig, DBStoreConfig } from './db-constants'

export type { DBConfig, DBStoreConfig }

export type UpgradeHandler = (
  db: IDBDatabase,
  oldVersion: number,
  tx: IDBTransaction
) => void

interface OpenOptions {
  onUpgrade?: UpgradeHandler
}

const dbCache = new Map<string, IDBDatabase>()

function createStoreWithIndexes(
  db: IDBDatabase,
  storeConfig: DBStoreConfig
): void {
  const store = db.createObjectStore(storeConfig.name, {
    keyPath: storeConfig.keyPath,
  })
  if (storeConfig.indexes) {
    for (const idx of storeConfig.indexes) {
      store.createIndex(idx.name, idx.keyPath, { unique: idx.unique ?? false })
    }
  }
}

export async function openDatabase(
  config: DBConfig,
  options?: OpenOptions
): Promise<IDBDatabase> {
  const cached = dbCache.get(config.name)
  if (cached) return cached

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(config.name, config.version)

    request.onerror = () => {
      logger.error(`Failed to open ${config.name} DB`, request.error, {
        module: config.module,
      })
      reject(request.error)
    }

    request.onsuccess = () => {
      dbCache.set(config.name, request.result)
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const tx = (event.target as IDBOpenDBRequest).transaction!
      const oldVersion = event.oldVersion

      for (const storeConfig of config.stores) {
        if (!db.objectStoreNames.contains(storeConfig.name)) {
          createStoreWithIndexes(db, storeConfig)
        }
      }

      if (options?.onUpgrade) {
        options.onUpgrade(db, oldVersion, tx)
      }
    }
  })
}

export function closeDatabase(dbName: string): void {
  const cached = dbCache.get(dbName)
  if (cached) {
    cached.close()
    dbCache.delete(dbName)
  }
}

export function closeAllDatabases(): void {
  for (const db of dbCache.values()) {
    db.close()
  }
  dbCache.clear()
}

export async function deleteDatabase(
  dbName: string,
  module: string
): Promise<void> {
  closeDatabase(dbName)
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName)
    request.onerror = () => {
      logger.error(`Failed to delete ${dbName} DB`, request.error, { module })
      reject(request.error)
    }
    request.onsuccess = () => {
      logger.info(`Database ${dbName} deleted`, { module })
      resolve()
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

export async function idbDeleteBatch(
  db: IDBDatabase,
  storeName: string,
  keys: IDBValidKey[]
): Promise<void> {
  if (keys.length === 0) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    const store = tx.objectStore(storeName)
    for (const key of keys) {
      store.delete(key)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbDeleteWhere(
  db: IDBDatabase,
  storeName: string,
  predicate: (key: IDBValidKey) => boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        if (predicate(cursor.key)) {
          cursor.delete()
        }
        cursor.continue()
      }
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbGetByIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  key: IDBValidKey
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.getAll(key)

    tx.oncomplete = () => resolve(request.result as T[])
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbGetKeysByIndex(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  key: IDBValidKey
): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.getAllKeys(key)

    tx.oncomplete = () => resolve(request.result)
    tx.onerror = () => reject(tx.error)
  })
}
