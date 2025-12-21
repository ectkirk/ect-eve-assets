import { logger } from '@/lib/logger'
import { cacheSchemas } from './types'

const DB_NAME = 'ecteveassets-cache'
const DB_VERSION = 10

let db: IDBDatabase | null = null

export async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open cache DB', request.error, {
        module: 'ReferenceCache',
      })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion

      if (!database.objectStoreNames.contains('types')) {
        database.createObjectStore('types', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('structures')) {
        database.createObjectStore('structures', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('locations')) {
        database.createObjectStore('locations', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('abyssals')) {
        database.createObjectStore('abyssals', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('names')) {
        database.createObjectStore('names', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('categories')) {
        database.createObjectStore('categories', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('groups')) {
        database.createObjectStore('groups', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('regions')) {
        database.createObjectStore('regions', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('systems')) {
        database.createObjectStore('systems', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('stations')) {
        database.createObjectStore('stations', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('refStructures')) {
        database.createObjectStore('refStructures', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('blueprints')) {
        database.createObjectStore('blueprints', { keyPath: 'id' })
      }

      if (oldVersion < 4 && database.objectStoreNames.contains('locations')) {
        const tx = (event.target as IDBOpenDBRequest).transaction!
        tx.objectStore('locations').clear()
        logger.info('Cleared locations cache for v4 upgrade', {
          module: 'ReferenceCache',
        })
      }
    }
  })
}

export async function loadStore<T>(storeName: string): Promise<Map<number, T>> {
  const database = await openDB()
  const schema = cacheSchemas[storeName]

  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const map = new Map<number, T>()
      let invalidCount = 0

      for (const item of request.result as Array<unknown>) {
        if (!schema) {
          const typed = item as T & { id: number }
          map.set(typed.id, typed)
          continue
        }

        const result = schema.safeParse(item)
        if (result.success) {
          const validated = result.data as T & { id: number }
          map.set(validated.id, validated)
        } else {
          invalidCount++
        }
      }

      if (invalidCount > 0) {
        logger.warn('Skipped invalid cache entries', {
          module: 'ReferenceCache',
          store: storeName,
          invalidCount,
          validCount: map.size,
        })
      }

      resolve(map)
    }
  })
}

export async function writeBatch<T extends { id: number }>(
  storeName: string,
  items: T[],
  onComplete: () => void
): Promise<void> {
  if (items.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      onComplete()
      resolve()
    }

    for (const item of items) {
      store.put(item)
    }
  })
}

export async function clearStore(storeName: string): Promise<void> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function closeDB(): void {
  if (db) {
    db.close()
    db = null
  }
}

export async function deleteDatabase(): Promise<void> {
  closeDB()
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onerror = () => {
      logger.error('Failed to delete cache DB', request.error, {
        module: 'ReferenceCache',
      })
      reject(request.error)
    }
    request.onsuccess = () => {
      logger.info('Reference cache cleared', { module: 'ReferenceCache' })
      resolve()
    }
  })
}
