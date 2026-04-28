import { logger } from '@/lib/logger'
import type { DBConfig, DBStoreConfig } from './db-constants'

export type { DBConfig, DBStoreConfig }

export type UpgradeHandler = (
  db: IDBDatabase,
  oldVersion: number,
  tx: IDBTransaction,
) => void

interface OpenOptions {
  onUpgrade?: UpgradeHandler
}

const dbCache = new Map<string, Promise<IDBDatabase>>()

function toDatabaseError(error: DOMException | null): Error {
  return error ?? new Error('IndexedDB request failed')
}

function createStoreWithIndexes(
  db: IDBDatabase,
  storeConfig: DBStoreConfig,
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
  options?: OpenOptions,
): Promise<IDBDatabase> {
  const cached = dbCache.get(config.name)
  if (cached) return cached

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(config.name, config.version)

    request.onerror = () => {
      logger.error(`Failed to open ${config.name} DB`, request.error, {
        module: config.module,
      })
      reject(toDatabaseError(request.error))
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        dbCache.delete(config.name)
      }
      resolve(db)
    }

    request.onblocked = () => {
      logger.warn(
        `Database ${config.name} upgrade blocked by open connection`,
        {
          module: config.module,
        },
      )
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

  dbCache.set(config.name, promise)
  promise.catch(() => dbCache.delete(config.name))

  return promise
}

export async function closeDatabase(dbName: string): Promise<void> {
  const cached = dbCache.get(dbName)
  dbCache.delete(dbName)
  if (cached) {
    try {
      const db = await cached
      db.close()
    } catch {
      // DB never opened successfully, nothing to close
    }
  }
}

export async function closeAllDatabases(): Promise<void> {
  const entries = Array.from(dbCache.values())
  dbCache.clear()
  for (const promise of entries) {
    try {
      const db = await promise
      db.close()
    } catch {
      // DB never opened successfully, nothing to close
    }
  }
}

export async function deleteDatabase(
  dbName: string,
  module: string,
): Promise<void> {
  await closeDatabase(dbName)
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName)
    request.onerror = () => {
      logger.error(`Failed to delete ${dbName} DB`, request.error, { module })
      reject(toDatabaseError(request.error))
    }
    request.onsuccess = () => {
      logger.info(`Database ${dbName} deleted`, { module })
      resolve()
    }
  })
}

export async function idbGetAll<T>(
  db: IDBDatabase,
  storeName: string,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    tx.oncomplete = () => {
      resolve(request.result as T[])
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbGet<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)

    tx.oncomplete = () => {
      resolve(request.result as T | undefined)
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbPut<T>(
  db: IDBDatabase,
  storeName: string,
  item: T,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    const store = tx.objectStore(storeName)
    store.put(item)
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbPutBatch<T>(
  db: IDBDatabase,
  storeName: string,
  items: T[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    const store = tx.objectStore(storeName)
    for (const item of items) {
      store.put(item)
    }
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbDelete(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbClear(
  db: IDBDatabase,
  storeName: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    tx.objectStore(storeName).clear()
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbClearMultiple(
  db: IDBDatabase,
  storeNames: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite')
    for (const name of storeNames) {
      tx.objectStore(name).clear()
    }
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbDeleteBatch(
  db: IDBDatabase,
  storeName: string,
  keys: IDBValidKey[],
): Promise<void> {
  if (keys.length === 0) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite')
    const store = tx.objectStore(storeName)
    for (const key of keys) {
      store.delete(key)
    }
    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbDeleteWhere(
  db: IDBDatabase,
  storeName: string,
  predicate: (key: IDBValidKey) => boolean,
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

    tx.oncomplete = () => {
      resolve()
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbGetByIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.getAll(key)

    tx.oncomplete = () => {
      resolve(request.result as T[])
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}

export async function idbGetKeysByIndex(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  key: IDBValidKey,
): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.getAllKeys(key)

    tx.oncomplete = () => {
      resolve(request.result)
    }
    tx.onerror = () => {
      reject(toDatabaseError(tx.error))
    }
  })
}
