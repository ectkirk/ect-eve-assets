import { ConfigurationError } from '@/lib/errors'
import type { Owner } from '@/store/auth-store'
import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbDelete,
  idbClearMultiple,
  idbGet,
  type DBConfig,
} from '@/lib/idb-utils'

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
    throw new ConfigurationError(
      `OwnerDB ${storeName}: either dataKey or deserialize must be provided`
    )
  }
  if (!dataKey && !serialize) {
    throw new ConfigurationError(
      `OwnerDB ${storeName}: either dataKey or serialize must be provided`
    )
  }

  const dbConfig: DBConfig = {
    name: dbName,
    version,
    stores: metaStoreName
      ? [
          { name: storeName, keyPath: 'ownerKey' },
          { name: metaStoreName, keyPath: 'key' },
        ]
      : [{ name: storeName, keyPath: 'ownerKey' }],
    module: moduleName,
  }

  async function getDB(): Promise<IDBDatabase> {
    return openDatabase(dbConfig)
  }

  const loadAll = async (): Promise<OwnerData<T>[]> => {
    const db = await getDB()
    const records = await idbGetAll<Record<string, unknown>>(db, storeName)
    const results: OwnerData<T>[] = []
    for (const stored of records) {
      if (deserialize) {
        results.push({
          owner: stored.owner as Owner,
          data: deserialize(stored),
        })
      } else if (dataKey) {
        results.push({
          owner: stored.owner as Owner,
          data: stored[dataKey] as T,
        })
      }
    }
    return results
  }

  const save = async (
    ownerKey: string,
    owner: Owner,
    data: T
  ): Promise<void> => {
    const db = await getDB()
    const record = serialize
      ? { ownerKey, owner, ...serialize(data) }
      : { ownerKey, owner, [dataKey!]: data }
    await idbPut(db, storeName, record)
  }

  const deleteOwner = async (ownerKey: string): Promise<void> => {
    const db = await getDB()
    await idbDelete(db, storeName, ownerKey)
  }

  const clear = async (): Promise<void> => {
    const db = await getDB()
    const storeNames = metaStoreName ? [storeName, metaStoreName] : [storeName]
    await idbClearMultiple(db, storeNames)
  }

  const loadMeta = async <M>(key: string): Promise<M | undefined> => {
    if (!metaStoreName) return undefined
    const db = await getDB()
    const record = await idbGet<{ key: string; value: M }>(
      db,
      metaStoreName,
      key
    )
    return record?.value
  }

  const saveMeta = async <M>(key: string, value: M): Promise<void> => {
    if (!metaStoreName) return
    const db = await getDB()
    await idbPut(db, metaStoreName, { key, value })
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
