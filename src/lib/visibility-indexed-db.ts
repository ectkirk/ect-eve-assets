import { logger } from '@/lib/logger'

export interface SourceOwner {
  type: 'character' | 'corporation'
  id: number
  characterId: number
}

export interface StoredItem<T> {
  item: T
  sourceOwner: SourceOwner
}

interface VisibilityRecord {
  ownerKey: string
  itemIds: number[]
}

export interface VisibilityDBConfig {
  dbName: string
  itemStoreName: string
  itemKeyName: string
  moduleName: string
}

export interface VisibilityDB<TStoredItem> {
  loadAll: () => Promise<{
    items: Map<number, TStoredItem>
    visibility: Map<string, Set<number>>
  }>
  saveItems: (
    items: Array<{ id: number; stored: TStoredItem }>
  ) => Promise<void>
  deleteItems: (itemIds: number[]) => Promise<void>
  saveVisibility: (ownerKey: string, itemIds: Set<number>) => Promise<void>
  deleteVisibility: (ownerKey: string) => Promise<void>
  clear: () => Promise<void>
}

export function createVisibilityDB<T, TStoredItem extends StoredItem<T>>(
  config: VisibilityDBConfig,
  getItemId: (stored: TStoredItem) => number
): VisibilityDB<TStoredItem> {
  const { dbName, itemStoreName, itemKeyName, moduleName } = config
  const visibilityStoreName = 'visibility'

  let db: IDBDatabase | null = null

  const openDB = async (): Promise<IDBDatabase> => {
    if (db) return db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1)

      request.onerror = () => {
        logger.error(`Failed to open ${itemStoreName} DB`, request.error, {
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
        if (!database.objectStoreNames.contains(itemStoreName)) {
          database.createObjectStore(itemStoreName, { keyPath: itemKeyName })
        }
        if (!database.objectStoreNames.contains(visibilityStoreName)) {
          database.createObjectStore(visibilityStoreName, {
            keyPath: 'ownerKey',
          })
        }
      }
    })
  }

  const toRecord = (
    id: number,
    stored: TStoredItem
  ): Record<string, unknown> => ({
    [itemKeyName]: id,
    item: stored.item,
    sourceOwner: stored.sourceOwner,
  })

  const fromRecord = (record: Record<string, unknown>): TStoredItem =>
    ({
      item: record.item as T,
      sourceOwner: record.sourceOwner as SourceOwner,
    }) as TStoredItem

  const loadAll = async (): Promise<{
    items: Map<number, TStoredItem>
    visibility: Map<string, Set<number>>
  }> => {
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction(
        [itemStoreName, visibilityStoreName],
        'readonly'
      )
      const itemsStore = tx.objectStore(itemStoreName)
      const visibilityStore = tx.objectStore(visibilityStoreName)

      const itemsRequest = itemsStore.getAll()
      const visibilityRequest = visibilityStore.getAll()

      tx.oncomplete = () => {
        const items = new Map<number, TStoredItem>()
        for (const record of itemsRequest.result) {
          const stored = fromRecord(record)
          items.set(getItemId(stored), stored)
        }

        const visibility = new Map<string, Set<number>>()
        for (const record of visibilityRequest.result as VisibilityRecord[]) {
          visibility.set(record.ownerKey, new Set(record.itemIds))
        }

        resolve({ items, visibility })
      }

      tx.onerror = () => reject(tx.error)
    })
  }

  const saveItems = async (
    items: Array<{ id: number; stored: TStoredItem }>
  ): Promise<void> => {
    if (items.length === 0) return
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([itemStoreName], 'readwrite')
      const store = tx.objectStore(itemStoreName)
      for (const { id, stored } of items) {
        store.put(toRecord(id, stored))
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  const deleteItems = async (itemIds: number[]): Promise<void> => {
    if (itemIds.length === 0) return
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([itemStoreName], 'readwrite')
      const store = tx.objectStore(itemStoreName)
      for (const id of itemIds) {
        store.delete(id)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  const saveVisibility = async (
    ownerKey: string,
    itemIds: Set<number>
  ): Promise<void> => {
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([visibilityStoreName], 'readwrite')
      const store = tx.objectStore(visibilityStoreName)
      store.put({
        ownerKey,
        itemIds: [...itemIds],
      } as VisibilityRecord)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  const deleteVisibility = async (ownerKey: string): Promise<void> => {
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction([visibilityStoreName], 'readwrite')
      const store = tx.objectStore(visibilityStoreName)
      store.delete(ownerKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  const clear = async (): Promise<void> => {
    const database = await openDB()

    return new Promise((resolve, reject) => {
      const tx = database.transaction(
        [itemStoreName, visibilityStoreName],
        'readwrite'
      )
      tx.objectStore(itemStoreName).clear()
      tx.objectStore(visibilityStoreName).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  return {
    loadAll,
    saveItems,
    deleteItems,
    saveVisibility,
    deleteVisibility,
    clear,
  }
}
