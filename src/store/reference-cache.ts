import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-cache'
const DB_VERSION = 5

export interface CachedType {
  id: number
  name: string
  groupId: number
  groupName: string
  categoryId: number
  categoryName: string
  volume: number
  packagedVolume?: number
  implantSlot?: number
  towerSize?: number
  fuelTier?: number
}

export interface CachedStructure {
  id: number
  name: string
  solarSystemId: number
  typeId: number
  ownerId: number
  resolvedByCharacterId?: number
  inaccessible?: boolean
}

export interface CachedLocation {
  id: number
  name: string
  type: 'region' | 'constellation' | 'system' | 'station' | 'structure' | 'celestial'
  solarSystemId?: number
  solarSystemName?: string
  regionId?: number
  regionName?: string
}

export interface CachedAbyssal {
  id: number // item_id
  price: number
  fetchedAt: number // timestamp
}

export interface CachedContractItems {
  contractId: number
  items: Array<{
    record_id: number
    type_id: number
    quantity: number
    is_included: boolean
    is_singleton: boolean
    raw_quantity?: number
    item_id?: number
    is_blueprint_copy?: boolean
  }>
}

export interface CachedName {
  id: number
  name: string
  category: 'alliance' | 'character' | 'constellation' | 'corporation' | 'inventory_type' | 'region' | 'solar_system' | 'station' | 'faction'
}

let db: IDBDatabase | null = null
let typesCache = new Map<number, CachedType>()
let structuresCache = new Map<number, CachedStructure>()
let locationsCache = new Map<number, CachedLocation>()
let abyssalsCache = new Map<number, CachedAbyssal>()
const namesCache = new Map<number, CachedName>()
const contractItemsKnown = new Set<number>()
const contractItemsCache = new Map<number, CachedContractItems['items']>()
let initialized = false

const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyListeners(): void {
  listeners.forEach((fn) => fn())
}

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open cache DB', request.error, { module: 'ReferenceCache' })
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
      if (!database.objectStoreNames.contains('contractItems')) {
        database.createObjectStore('contractItems', { keyPath: 'contractId' })
      }

      if (oldVersion < 4 && database.objectStoreNames.contains('locations')) {
        const tx = (event.target as IDBOpenDBRequest).transaction!
        tx.objectStore('locations').clear()
        logger.info('Cleared locations cache for v4 upgrade', { module: 'ReferenceCache' })
      }
    }
  })
}

async function loadStore<T>(storeName: string): Promise<Map<number, T>> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const map = new Map<number, T>()
      for (const item of request.result as Array<T & { id: number }>) {
        map.set(item.id, item)
      }
      resolve(map)
    }
  })
}

async function loadContractItemKeys(): Promise<Set<number>> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('contractItems', 'readonly')
    const store = tx.objectStore('contractItems')
    const request = store.getAllKeys()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      resolve(new Set(request.result as number[]))
    }
  })
}

export async function initCache(): Promise<void> {
  if (initialized) return

  logger.debug('Initializing reference cache', { module: 'ReferenceCache' })

  try {
    typesCache = await loadStore<CachedType>('types')
    structuresCache = await loadStore<CachedStructure>('structures')
    locationsCache = await loadStore<CachedLocation>('locations')
    abyssalsCache = await loadStore<CachedAbyssal>('abyssals')
    const contractKeys = await loadContractItemKeys()
    contractKeys.forEach((k) => contractItemsKnown.add(k))
    initialized = true

    logger.info('Reference cache initialized', {
      module: 'ReferenceCache',
      types: typesCache.size,
      structures: structuresCache.size,
      locations: locationsCache.size,
      abyssals: abyssalsCache.size,
    })
  } catch (err) {
    logger.error('Failed to initialize cache', err, { module: 'ReferenceCache' })
    initialized = true
  }
}

export function getType(id: number): CachedType | undefined {
  return typesCache.get(id)
}

export function getTypeName(id: number): string {
  return typesCache.get(id)?.name ?? `Unknown Type ${id}`
}

export function hasType(id: number): boolean {
  return typesCache.has(id)
}

export function getStructure(id: number): CachedStructure | undefined {
  return structuresCache.get(id)
}

export function hasStructure(id: number): boolean {
  return structuresCache.has(id)
}

export function getLocation(id: number): CachedLocation | undefined {
  return locationsCache.get(id)
}

export function hasLocation(id: number): boolean {
  return locationsCache.has(id)
}

export function getLocationName(id: number): string {
  if (id > 1_000_000_000_000) {
    const structure = structuresCache.get(id)
    return structure?.name ?? `Structure ${id}`
  }
  const location = locationsCache.get(id)
  return location?.name ?? `Location ${id}`
}

export function getAbyssal(itemId: number): CachedAbyssal | undefined {
  return abyssalsCache.get(itemId)
}

export function hasAbyssal(itemId: number): boolean {
  return abyssalsCache.has(itemId)
}

export function getAbyssalPrice(itemId: number): number | undefined {
  return abyssalsCache.get(itemId)?.price
}

export function getName(id: number): CachedName | undefined {
  return namesCache.get(id)
}

export function hasName(id: number): boolean {
  return namesCache.has(id)
}

export function saveNames(names: CachedName[]): void {
  if (names.length === 0) return
  for (const name of names) {
    namesCache.set(name.id, name)
  }
  notifyListeners()
}

export function hasContractItems(contractId: number): boolean {
  return contractItemsKnown.has(contractId)
}

export function getContractItemsSync(contractId: number): CachedContractItems['items'] | undefined {
  return contractItemsCache.get(contractId)
}

export async function getContractItems(contractId: number): Promise<CachedContractItems['items'] | undefined> {
  if (!contractItemsKnown.has(contractId)) return undefined

  const cached = contractItemsCache.get(contractId)
  if (cached) return cached

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('contractItems', 'readonly')
    const store = tx.objectStore('contractItems')
    const request = store.get(contractId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const result = request.result as CachedContractItems | undefined
      if (result?.items) {
        contractItemsCache.set(contractId, result.items)
      }
      resolve(result?.items)
    }
  })
}

export async function saveContractItems(contractId: number, items: CachedContractItems['items']): Promise<void> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('contractItems', 'readwrite')
    const store = tx.objectStore('contractItems')

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      contractItemsKnown.add(contractId)
      contractItemsCache.set(contractId, items)
      resolve()
    }

    store.put({ contractId, items } as CachedContractItems)
  })
}

export async function saveTypes(types: CachedType[]): Promise<void> {
  if (types.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('types', 'readwrite')
    const store = tx.objectStore('types')

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      for (const type of types) {
        typesCache.set(type.id, type)
      }
      notifyListeners()
      resolve()
    }

    for (const type of types) {
      store.put(type)
    }
  })
}

export async function saveStructures(structures: CachedStructure[]): Promise<void> {
  if (structures.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('structures', 'readwrite')
    const store = tx.objectStore('structures')

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      for (const structure of structures) {
        structuresCache.set(structure.id, structure)
      }
      notifyListeners()
      resolve()
    }

    for (const structure of structures) {
      store.put(structure)
    }
  })
}

export async function saveLocations(locations: CachedLocation[]): Promise<void> {
  if (locations.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('locations', 'readwrite')
    const store = tx.objectStore('locations')

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      for (const location of locations) {
        locationsCache.set(location.id, location)
      }
      notifyListeners()
      resolve()
    }

    for (const location of locations) {
      store.put(location)
    }
  })
}

export async function saveAbyssals(abyssals: CachedAbyssal[]): Promise<void> {
  if (abyssals.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('abyssals', 'readwrite')
    const store = tx.objectStore('abyssals')

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      for (const abyssal of abyssals) {
        abyssalsCache.set(abyssal.id, abyssal)
      }
      notifyListeners()
      resolve()
    }

    for (const abyssal of abyssals) {
      store.put(abyssal)
    }
  })
}

export async function clearReferenceCache(): Promise<void> {
  logger.info('Clearing reference cache', { module: 'ReferenceCache' })

  typesCache.clear()
  structuresCache.clear()
  locationsCache.clear()
  abyssalsCache.clear()
  namesCache.clear()
  contractItemsKnown.clear()
  contractItemsCache.clear()
  initialized = false

  if (db) {
    db.close()
    db = null
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onerror = () => {
      logger.error('Failed to delete cache DB', request.error, { module: 'ReferenceCache' })
      reject(request.error)
    }
    request.onsuccess = () => {
      logger.info('Reference cache cleared', { module: 'ReferenceCache' })
      resolve()
    }
  })
}

async function clearStore(storeName: string): Promise<void> {
  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearTypesCache(): Promise<void> {
  logger.info('Clearing types cache', { module: 'ReferenceCache' })
  typesCache.clear()
  await clearStore('types')
  notifyListeners()
}

export async function clearLocationsCache(): Promise<void> {
  logger.info('Clearing locations cache', { module: 'ReferenceCache' })
  locationsCache.clear()
  await clearStore('locations')
  notifyListeners()
}

export async function clearStructuresCache(): Promise<void> {
  logger.info('Clearing structures cache', { module: 'ReferenceCache' })
  structuresCache.clear()
  await clearStore('structures')
  notifyListeners()
}

export async function clearAbyssalsCache(): Promise<void> {
  logger.info('Clearing abyssals cache', { module: 'ReferenceCache' })
  abyssalsCache.clear()
  await clearStore('abyssals')
  notifyListeners()
}

export async function clearContractItemsCache(): Promise<void> {
  logger.info('Clearing contract items cache', { module: 'ReferenceCache' })
  contractItemsKnown.clear()
  contractItemsCache.clear()
  await clearStore('contractItems')
  notifyListeners()
}

export const CategoryIds = {
  SHIP: 6,
  MODULE: 7,
  CHARGE: 8,
  BLUEPRINT: 9,
  SKILL: 16,
  DRONE: 18,
  IMPLANT: 20,
  STRUCTURE: 65,
  SKIN: 91,
} as const

export const LocationFlags = {
  HANGAR: 4,
  CARGO: 5,
  SHIP_HANGAR: 90,
  DELIVERIES: 173,
  CORP_DELIVERIES: 62,
  ASSET_SAFETY: 36,
  CLONE_BAY: 89,
} as const
