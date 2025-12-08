import type { SDEType, EVERefStructure } from './types'

const DB_NAME = 'ecteveassets-sde'
const DB_VERSION = 3

interface SDEDatabase {
  types: Map<number, SDEType>
  structures: Map<number, EVERefStructure>
  // Location names resolved via /universe/names/
  locationNames: Map<number, string>
}

let db: IDBDatabase | null = null
let cache: SDEDatabase | null = null
let structuresVersion = 0
const structuresListeners: Set<() => void> = new Set()

export function subscribeToStructures(listener: () => void): () => void {
  structuresListeners.add(listener)
  return () => structuresListeners.delete(listener)
}

export function getStructuresVersion(): number {
  return structuresVersion
}

function notifyStructuresUpdated(): void {
  structuresVersion++
  structuresListeners.forEach((listener) => listener())
}

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

      // Metadata store
      if (!database.objectStoreNames.contains('metadata')) {
        database.createObjectStore('metadata', { keyPath: 'key' })
      }

      // Structures store (player structures from everef.net + ESI)
      if (!database.objectStoreNames.contains('structures')) {
        database.createObjectStore('structures', { keyPath: 'structureId' })
      }

      // Location names store (resolved via /universe/names/)
      if (!database.objectStoreNames.contains('locationNames')) {
        database.createObjectStore('locationNames', { keyPath: 'id' })
      }

      // Remove old stores from previous versions
      if (database.objectStoreNames.contains('stations')) {
        database.deleteObjectStore('stations')
      }
      if (database.objectStoreNames.contains('solarSystems')) {
        database.deleteObjectStore('solarSystems')
      }
      if (database.objectStoreNames.contains('regions')) {
        database.deleteObjectStore('regions')
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
      for (const item of request.result as Array<T & { structureId?: number; typeId?: number; id?: number }>) {
        const key = item.structureId ?? item.typeId ?? item.id
        if (key !== undefined) {
          map.set(key, item)
        }
      }
      resolve(map)
    }
  })
}

// Load location names from DB (id -> name mapping)
async function loadLocationNamesFromDB(): Promise<Map<number, string>> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('locationNames', 'readonly')
    const store = transaction.objectStore('locationNames')
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const map = new Map<number, string>()
      for (const item of request.result as Array<{ id: number; name: string }>) {
        map.set(item.id, item.name)
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

export async function initSDE(): Promise<SDEDatabase> {
  if (cache) return cache

  // Load all cached data from IndexedDB
  const types = await loadFromDB<SDEType>('types')
  const structures = await loadFromDB<EVERefStructure>('structures')
  const locationNames = await loadLocationNamesFromDB()

  // Types will be populated on-demand via ESI
  cache = { types, structures, locationNames }
  return cache
}

export function getType(typeId: number): SDEType | undefined {
  return cache?.types.get(typeId)
}

export function getTypeName(typeId: number): string {
  return cache?.types.get(typeId)?.name ?? `Unknown Type (${typeId})`
}

export function getLocationName(locationId: number): string {
  // Check if it's a player structure (> 1 trillion)
  if (locationId > 1000000000000) {
    const structure = cache?.structures.get(locationId)
    if (structure?.name) {
      return structure.name
    }
    return `Unknown Structure (${locationId})`
  }

  // Check cached location names (resolved via /universe/names/)
  const cachedName = cache?.locationNames.get(locationId)
  if (cachedName) {
    return cachedName
  }

  // Return placeholder - will be resolved via ESI
  return `Location (${locationId})`
}

// Save location names to IndexedDB and update cache
export async function saveLocationNames(names: Map<number, string>): Promise<void> {
  if (names.size === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('locationNames', 'readwrite')
    const store = transaction.objectStore('locationNames')

    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => {
      if (cache) {
        for (const [id, name] of names) {
          cache.locationNames.set(id, name)
        }
      }
      notifyStructuresUpdated() // Reuse listener to trigger UI update
      resolve()
    }

    for (const [id, name] of names) {
      store.put({ id, name })
    }
  })
}

// Check if location names are cached
export function hasLocationName(locationId: number): boolean {
  if (locationId > 1000000000000) {
    return !!cache?.structures.get(locationId)?.name
  }
  return cache?.locationNames.has(locationId) ?? false
}

// Check if type is cached
export function hasType(typeId: number): boolean {
  return cache?.types.has(typeId) ?? false
}

// Save types to IndexedDB and update cache
export async function saveTypes(types: SDEType[]): Promise<void> {
  if (types.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('types', 'readwrite')
    const store = transaction.objectStore('types')

    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => {
      if (cache) {
        for (const type of types) {
          cache.types.set(type.typeId, type)
        }
      }
      notifyStructuresUpdated() // Reuse listener to trigger UI update
      resolve()
    }

    for (const type of types) {
      store.put(type)
    }
  })
}

export function getStructure(structureId: number): EVERefStructure | undefined {
  return cache?.structures.get(structureId)
}

export async function loadStructuresFromEveRef(): Promise<number> {
  if (!window.electronAPI) {
    throw new Error('Electron API not available')
  }

  const data = await window.electronAPI.fetchStructures() as Record<string, {
    structure_id: number
    name: string
    solar_system_id: number
    type_id: number
    owner_id: number
  }>

  const structures: EVERefStructure[] = []
  for (const [id, structure] of Object.entries(data)) {
    if (structure.name) {
      structures.push({
        structureId: Number(id),
        name: structure.name,
        solarSystemId: structure.solar_system_id,
        typeId: structure.type_id,
        ownerId: structure.owner_id,
      })
    }
  }

  await saveToDBBulk('structures', structures)

  // Update cache
  if (cache) {
    cache.structures = new Map(structures.map((s) => [s.structureId, s]))
  }

  notifyStructuresUpdated()
  return structures.length
}

export function getStructuresCount(): number {
  return cache?.structures.size ?? 0
}

export async function clearStructuresCache(): Promise<void> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('structures', 'readwrite')
    const store = transaction.objectStore('structures')
    const request = store.clear()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (cache) {
        cache.structures = new Map()
      }
      resolve()
    }
  })
}

export async function saveStructure(structure: EVERefStructure): Promise<void> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('structures', 'readwrite')
    const store = transaction.objectStore('structures')
    const request = store.put(structure)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (cache) {
        cache.structures.set(structure.structureId, structure)
      }
      notifyStructuresUpdated()
      resolve()
    }
  })
}

export async function saveStructures(structures: EVERefStructure[]): Promise<void> {
  if (structures.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('structures', 'readwrite')
    const store = transaction.objectStore('structures')

    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => {
      if (cache) {
        for (const structure of structures) {
          cache.structures.set(structure.structureId, structure)
        }
      }
      notifyStructuresUpdated()
      resolve()
    }

    for (const structure of structures) {
      store.put(structure)
    }
  })
}
