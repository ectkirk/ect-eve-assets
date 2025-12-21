import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-regional-market'
const DB_VERSION = 2
const STORE_PRICES = 'prices'
const STORE_TRACKED = 'tracked'
const STORE_STRUCTURES = 'structures'

export interface PriceRecord {
  typeId: number
  lowestPrice: number | null
  highestBuyPrice: number | null
  locationPrices: Record<number, number>
  buyLocationPrices: Record<number, number>
  lastFetchAt: number
}

export interface TrackedRecord {
  key: string
  typeId: number
  regionId: number
}

export interface TrackedStructureRecord {
  structureId: number
  characterId: number
  typeIds: number[]
  lastFetchAt: number
}

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open regional market DB', request.error, {
        module: 'RegionalMarketDB',
      })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_PRICES)) {
        database.createObjectStore(STORE_PRICES, { keyPath: 'typeId' })
      }
      if (!database.objectStoreNames.contains(STORE_TRACKED)) {
        database.createObjectStore(STORE_TRACKED, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(STORE_STRUCTURES)) {
        database.createObjectStore(STORE_STRUCTURES, { keyPath: 'structureId' })
      }
    }
  })
}

export async function loadFromDB(): Promise<{
  prices: PriceRecord[]
  tracked: TrackedRecord[]
  structures: TrackedStructureRecord[]
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(
      [STORE_PRICES, STORE_TRACKED, STORE_STRUCTURES],
      'readonly'
    )
    const pricesStore = tx.objectStore(STORE_PRICES)
    const trackedStore = tx.objectStore(STORE_TRACKED)
    const structuresStore = tx.objectStore(STORE_STRUCTURES)

    const pricesRequest = pricesStore.getAll()
    const trackedRequest = trackedStore.getAll()
    const structuresRequest = structuresStore.getAll()

    tx.oncomplete = () => {
      resolve({
        prices: pricesRequest.result as PriceRecord[],
        tracked: trackedRequest.result as TrackedRecord[],
        structures: structuresRequest.result as TrackedStructureRecord[],
      })
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function savePricesToDB(records: PriceRecord[]): Promise<void> {
  if (records.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_PRICES], 'readwrite')
    const store = tx.objectStore(STORE_PRICES)
    for (const record of records) {
      store.put(record)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveTrackedToDB(records: TrackedRecord[]): Promise<void> {
  if (records.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_TRACKED], 'readwrite')
    const store = tx.objectStore(STORE_TRACKED)
    for (const record of records) {
      store.put(record)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteTrackedFromDB(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_TRACKED], 'readwrite')
    const store = tx.objectStore(STORE_TRACKED)
    for (const key of keys) {
      store.delete(key)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deletePricesFromDB(typeIds: number[]): Promise<void> {
  if (typeIds.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_PRICES], 'readwrite')
    const store = tx.objectStore(STORE_PRICES)
    for (const typeId of typeIds) {
      store.delete(typeId)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveStructureToDB(
  record: TrackedStructureRecord
): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_STRUCTURES], 'readwrite')
    const store = tx.objectStore(STORE_STRUCTURES)
    store.put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveStructuresToDB(
  records: TrackedStructureRecord[]
): Promise<void> {
  if (records.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_STRUCTURES], 'readwrite')
    const store = tx.objectStore(STORE_STRUCTURES)
    for (const record of records) {
      store.put(record)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteStructuresFromDB(
  structureIds: number[]
): Promise<void> {
  if (structureIds.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_STRUCTURES], 'readwrite')
    const store = tx.objectStore(STORE_STRUCTURES)
    for (const id of structureIds) {
      store.delete(id)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction(
      [STORE_PRICES, STORE_TRACKED, STORE_STRUCTURES],
      'readwrite'
    )
    tx.objectStore(STORE_PRICES).clear()
    tx.objectStore(STORE_TRACKED).clear()
    tx.objectStore(STORE_STRUCTURES).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
