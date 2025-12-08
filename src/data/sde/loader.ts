import type { SDEType, SDEStation, SDESolarSystem, SDERegion } from './types'

const DB_NAME = 'ecteveassets-sde'
const DB_VERSION = 1

interface SDEDatabase {
  types: Map<number, SDEType>
  stations: Map<number, SDEStation>
  solarSystems: Map<number, SDESolarSystem>
  regions: Map<number, SDERegion>
}

let db: IDBDatabase | null = null
let cache: SDEDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Types store
      if (!database.objectStoreNames.contains('types')) {
        database.createObjectStore('types', { keyPath: 'typeId' })
      }

      // Stations store
      if (!database.objectStoreNames.contains('stations')) {
        const store = database.createObjectStore('stations', {
          keyPath: 'stationId',
        })
        store.createIndex('solarSystemId', 'solarSystemId')
      }

      // Solar systems store
      if (!database.objectStoreNames.contains('solarSystems')) {
        const store = database.createObjectStore('solarSystems', {
          keyPath: 'solarSystemId',
        })
        store.createIndex('regionId', 'regionId')
      }

      // Regions store
      if (!database.objectStoreNames.contains('regions')) {
        database.createObjectStore('regions', { keyPath: 'regionId' })
      }

      // Metadata store
      if (!database.objectStoreNames.contains('metadata')) {
        database.createObjectStore('metadata', { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB<T>(storeName: string): Promise<Map<number, T>> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const map = new Map<number, T>()
      for (const item of request.result as Array<T & { typeId?: number; stationId?: number; solarSystemId?: number; regionId?: number }>) {
        const key = item.typeId ?? item.stationId ?? item.solarSystemId ?? item.regionId
        if (key !== undefined) {
          map.set(key, item)
        }
      }
      resolve(map)
    }
  })
}

async function saveToDBBulk<T>(storeName: string, items: T[]): Promise<void> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)

    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => resolve()

    for (const item of items) {
      store.put(item)
    }
  })
}

async function fetchBundledData<T>(filename: string): Promise<T[]> {
  const response = await fetch(`/sde/${filename}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${filename}: ${response.status}`)
  }
  return response.json()
}

async function loadBundledSDE(): Promise<void> {
  const [types, stations, solarSystems, regions] = await Promise.all([
    fetchBundledData<SDEType>('types.json'),
    fetchBundledData<SDEStation>('stations.json'),
    fetchBundledData<SDESolarSystem>('solarSystems.json'),
    fetchBundledData<SDERegion>('regions.json'),
  ])

  await Promise.all([
    saveToDBBulk('types', types),
    saveToDBBulk('stations', stations),
    saveToDBBulk('solarSystems', solarSystems),
    saveToDBBulk('regions', regions),
  ])
}

export async function initSDE(): Promise<SDEDatabase> {
  if (cache) return cache

  // Try to load from IndexedDB first
  let [types, stations, solarSystems, regions] = await Promise.all([
    loadFromDB<SDEType>('types'),
    loadFromDB<SDEStation>('stations'),
    loadFromDB<SDESolarSystem>('solarSystems'),
    loadFromDB<SDERegion>('regions'),
  ])

  // If IndexedDB is empty, load bundled data
  if (types.size === 0) {
    await loadBundledSDE()
    ;[types, stations, solarSystems, regions] = await Promise.all([
      loadFromDB<SDEType>('types'),
      loadFromDB<SDEStation>('stations'),
      loadFromDB<SDESolarSystem>('solarSystems'),
      loadFromDB<SDERegion>('regions'),
    ])
  }

  cache = { types, stations, solarSystems, regions }
  return cache
}

export async function updateSDE(data: {
  types?: SDEType[]
  stations?: SDEStation[]
  solarSystems?: SDESolarSystem[]
  regions?: SDERegion[]
}): Promise<void> {
  const promises: Promise<void>[] = []

  if (data.types?.length) {
    promises.push(saveToDBBulk('types', data.types))
  }
  if (data.stations?.length) {
    promises.push(saveToDBBulk('stations', data.stations))
  }
  if (data.solarSystems?.length) {
    promises.push(saveToDBBulk('solarSystems', data.solarSystems))
  }
  if (data.regions?.length) {
    promises.push(saveToDBBulk('regions', data.regions))
  }

  await Promise.all(promises)

  // Invalidate cache to force reload
  cache = null
}

export function getType(typeId: number): SDEType | undefined {
  return cache?.types.get(typeId)
}

export function getStation(stationId: number): SDEStation | undefined {
  return cache?.stations.get(stationId)
}

export function getSolarSystem(
  solarSystemId: number
): SDESolarSystem | undefined {
  return cache?.solarSystems.get(solarSystemId)
}

export function getRegion(regionId: number): SDERegion | undefined {
  return cache?.regions.get(regionId)
}

export function getTypeName(typeId: number): string {
  return cache?.types.get(typeId)?.name ?? `Unknown Type (${typeId})`
}

export function getLocationName(locationId: number): string {
  // Check if it's a station (60M-69M range)
  if (locationId >= 60000000 && locationId < 70000000) {
    return cache?.stations.get(locationId)?.name ?? `Unknown Station (${locationId})`
  }

  // Check if it's a solar system (30M-40M range)
  if (locationId >= 30000000 && locationId < 40000000) {
    return cache?.solarSystems.get(locationId)?.name ?? `Unknown System (${locationId})`
  }

  // Check if it's a region (10M-20M range)
  if (locationId >= 10000000 && locationId < 20000000) {
    return cache?.regions.get(locationId)?.name ?? `Unknown Region (${locationId})`
  }

  // Structure or other player-owned location
  return `Structure (${locationId})`
}
