import { logger } from '@/lib/logger'
import type { Owner } from '@/store/auth-store'

export interface OwnerData<T> {
  owner: Owner
  data: T
}

export interface OwnerDBConfig<T> {
  dbName: string
  storeName: string
  dataKey?: string
  metaStoreName?: string
  version?: number
  moduleName: string
  serialize?: (data: T) => Record<string, unknown>
  deserialize?: (stored: Record<string, unknown>) => T
}

export interface OwnerDB<T> {
  loadAll: () => Promise<OwnerData<T>[]>
  save: (ownerKey: string, owner: Owner, data: T) => Promise<void>
  delete: (ownerKey: string) => Promise<void>
  clear: () => Promise<void>
  loadMeta: <M>(key: string) => Promise<M | undefined>
  saveMeta: <M>(key: string, value: M) => Promise<void>
}

export function createOwnerDB<T>(config: OwnerDBConfig<T>): OwnerDB<T> {
  const {
    dbName,
    storeName,
    dataKey,
    metaStoreName,
    version = 1,
    moduleName,
    serialize,
    deserialize,
  } = config

  if (!dataKey && !deserialize) {
    throw new Error(
      `OwnerDB ${storeName}: either dataKey or deserialize must be provided`
    )
  }
  if (!dataKey && !serialize) {
    throw new Error(
      `OwnerDB ${storeName}: either dataKey or serialize must be provided`
    )
  }

  let db: IDBDatabase | null = null

  const openDB = async (): Promise<IDBDatabase> => {
    if (db) return db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version)

      request.onerror = () => {
        logger.error(`Failed to open ${storeName} DB`, request.error, {
          module: moduleName,
        })
        reject(request.error)
      }

      request.onsuccess = () => {
        db = request.result
        resolve(db)
      }

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'ownerKey' })
        }
        if (
          metaStoreName &&
          !database.objectStoreNames.contains(metaStoreName)
        ) {
          database.createObjectStore(metaStoreName, { keyPath: 'key' })
        }
      }
    })
  }

  const loadAll = async (): Promise<OwnerData<T>[]> => {
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([storeName], 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.getAll()

      tx.oncomplete = () => {
        const results: OwnerData<T>[] = []
        for (const stored of request.result) {
          if (deserialize) {
            results.push({ owner: stored.owner, data: deserialize(stored) })
          } else if (dataKey) {
            results.push({ owner: stored.owner, data: stored[dataKey] })
          }
        }
        resolve(results)
      }

      tx.onerror = () => reject(tx.error)
    })
  }

  const save = async (
    ownerKey: string,
    owner: Owner,
    data: T
  ): Promise<void> => {
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([storeName], 'readwrite')
      const store = tx.objectStore(storeName)

      if (serialize) {
        store.put({ ownerKey, owner, ...serialize(data) })
      } else if (dataKey) {
        store.put({ ownerKey, owner, [dataKey]: data })
      }

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  const deleteOwner = async (ownerKey: string): Promise<void> => {
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([storeName], 'readwrite')
      const store = tx.objectStore(storeName)

      store.delete(ownerKey)

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  const clear = async (): Promise<void> => {
    const database = await openDB()
    const storeNames = metaStoreName ? [storeName, metaStoreName] : [storeName]

    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeNames, 'readwrite')
      for (const name of storeNames) {
        tx.objectStore(name).clear()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  const loadMeta = async <M>(key: string): Promise<M | undefined> => {
    if (!metaStoreName) return undefined
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([metaStoreName], 'readonly')
      const store = tx.objectStore(metaStoreName)
      const request = store.get(key)

      tx.oncomplete = () => resolve(request.result?.value)
      tx.onerror = () => reject(tx.error)
    })
  }

  const saveMeta = async <M>(key: string, value: M): Promise<void> => {
    if (!metaStoreName) return
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([metaStoreName], 'readwrite')
      const store = tx.objectStore(metaStoreName)

      store.put({ key, value })

      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  return {
    loadAll,
    save,
    delete: deleteOwner,
    clear,
    loadMeta,
    saveMeta,
  }
}
