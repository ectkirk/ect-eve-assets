import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-cache'
const DB_VERSION = 7

export interface CachedCategory {
  id: number
  name: string
}

export interface CachedGroup {
  id: number
  name: string
  categoryId: number
}

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

export interface CachedName {
  id: number
  name: string
  category: 'alliance' | 'character' | 'constellation' | 'corporation' | 'inventory_type' | 'region' | 'solar_system' | 'station' | 'faction'
}

let db: IDBDatabase | null = null
let categoriesCache = new Map<number, CachedCategory>()
let groupsCache = new Map<number, CachedGroup>()
let typesCache = new Map<number, CachedType>()
let structuresCache = new Map<number, CachedStructure>()
let locationsCache = new Map<number, CachedLocation>()
let abyssalsCache = new Map<number, CachedAbyssal>()
let namesCache = new Map<number, CachedName>()
let initialized = false
let referenceDataLoaded = false

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
      if (!database.objectStoreNames.contains('names')) {
        database.createObjectStore('names', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('categories')) {
        database.createObjectStore('categories', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('groups')) {
        database.createObjectStore('groups', { keyPath: 'id' })
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

export async function initCache(): Promise<void> {
  if (initialized) return

  logger.debug('Initializing reference cache', { module: 'ReferenceCache' })

  try {
    typesCache = await loadStore<CachedType>('types')
    structuresCache = await loadStore<CachedStructure>('structures')
    locationsCache = await loadStore<CachedLocation>('locations')
    abyssalsCache = await loadStore<CachedAbyssal>('abyssals')
    namesCache = await loadStore<CachedName>('names')
    categoriesCache = await loadStore<CachedCategory>('categories')
    groupsCache = await loadStore<CachedGroup>('groups')
    initialized = true
    referenceDataLoaded = groupsCache.size > 0

    logger.info('Reference cache initialized', {
      module: 'ReferenceCache',
      types: typesCache.size,
      structures: structuresCache.size,
      locations: locationsCache.size,
      abyssals: abyssalsCache.size,
      names: namesCache.size,
      categories: categoriesCache.size,
      groups: groupsCache.size,
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

export function getCategory(id: number): CachedCategory | undefined {
  return categoriesCache.get(id)
}

export function getGroup(id: number): CachedGroup | undefined {
  return groupsCache.get(id)
}

export function isReferenceDataLoaded(): boolean {
  return referenceDataLoaded
}

export async function setCategories(categories: CachedCategory[]): Promise<void> {
  if (categories.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('categories', 'readwrite')
    const store = tx.objectStore('categories')

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      categoriesCache = new Map(categories.map(c => [c.id, c]))
      logger.info('Categories saved', { module: 'ReferenceCache', count: categories.length })
      resolve()
    }

    for (const category of categories) {
      store.put(category)
    }
  })
}

export async function setGroups(groups: CachedGroup[]): Promise<void> {
  if (groups.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('groups', 'readwrite')
    const store = tx.objectStore('groups')

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      groupsCache = new Map(groups.map(g => [g.id, g]))
      referenceDataLoaded = true
      logger.info('Groups saved', { module: 'ReferenceCache', count: groups.length })
      resolve()
    }

    for (const group of groups) {
      store.put(group)
    }
  })
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

export async function saveNames(names: CachedName[]): Promise<void> {
  if (names.length === 0) return

  const database = await openDB()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('names', 'readwrite')
    const store = tx.objectStore('names')

    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => {
      for (const name of names) {
        namesCache.set(name.id, name)
      }
      notifyListeners()
      resolve()
    }

    for (const name of names) {
      store.put(name)
    }
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

  categoriesCache.clear()
  groupsCache.clear()
  typesCache.clear()
  structuresCache.clear()
  locationsCache.clear()
  abyssalsCache.clear()
  namesCache.clear()
  initialized = false
  referenceDataLoaded = false

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

export async function clearNamesCache(): Promise<void> {
  logger.info('Clearing names cache', { module: 'ReferenceCache' })
  namesCache.clear()
  await clearStore('names')
  notifyListeners()
}

export async function clearCategoriesCache(): Promise<void> {
  logger.info('Clearing categories cache', { module: 'ReferenceCache' })
  categoriesCache.clear()
  await clearStore('categories')
  notifyListeners()
}

export async function clearGroupsCache(): Promise<void> {
  logger.info('Clearing groups cache', { module: 'ReferenceCache' })
  groupsCache.clear()
  referenceDataLoaded = false
  await clearStore('groups')
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
