import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbPutBatch,
  idbDelete,
  idbDeleteBatch,
  idbClearMultiple,
  type DBConfig,
} from '@/lib/idb-utils'

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

  const dbConfig: DBConfig = {
    name: dbName,
    version: 1,
    stores: [
      { name: itemStoreName, keyPath: itemKeyName },
      { name: visibilityStoreName, keyPath: 'ownerKey' },
    ],
    module: moduleName,
  }

  async function getDB(): Promise<IDBDatabase> {
    return openDatabase(dbConfig)
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
    const db = await getDB()
    const [itemRecords, visibilityRecords] = await Promise.all([
      idbGetAll<Record<string, unknown>>(db, itemStoreName),
      idbGetAll<VisibilityRecord>(db, visibilityStoreName),
    ])

    const items = new Map<number, TStoredItem>()
    for (const record of itemRecords) {
      const stored = fromRecord(record)
      items.set(getItemId(stored), stored)
    }

    const visibility = new Map<string, Set<number>>()
    for (const record of visibilityRecords) {
      visibility.set(record.ownerKey, new Set(record.itemIds))
    }

    return { items, visibility }
  }

  const saveItems = async (
    items: Array<{ id: number; stored: TStoredItem }>
  ): Promise<void> => {
    if (items.length === 0) return
    const db = await getDB()
    const records = items.map(({ id, stored }) => toRecord(id, stored))
    await idbPutBatch(db, itemStoreName, records)
  }

  const deleteItems = async (itemIds: number[]): Promise<void> => {
    if (itemIds.length === 0) return
    const db = await getDB()
    await idbDeleteBatch(db, itemStoreName, itemIds)
  }

  const saveVisibility = async (
    ownerKey: string,
    itemIds: Set<number>
  ): Promise<void> => {
    const db = await getDB()
    await idbPut(db, visibilityStoreName, {
      ownerKey,
      itemIds: [...itemIds],
    } as VisibilityRecord)
  }

  const deleteVisibility = async (ownerKey: string): Promise<void> => {
    const db = await getDB()
    await idbDelete(db, visibilityStoreName, ownerKey)
  }

  const clear = async (): Promise<void> => {
    const db = await getDB()
    await idbClearMultiple(db, [itemStoreName, visibilityStoreName])
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
