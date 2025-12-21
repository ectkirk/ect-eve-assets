import { logger } from '@/lib/logger'
import { loadStore, writeBatch, clearStore, deleteDatabase } from './db'
import type {
  CachedRegion,
  CachedSystem,
  CachedStation,
  CachedRefStructure,
  CachedCategory,
  CachedGroup,
  CachedBlueprint,
  CachedType,
  CachedStructure,
  CachedLocation,
  CachedAbyssal,
  CachedName,
} from './types'

export type {
  CachedRegion,
  CachedSystem,
  CachedStation,
  CachedRefStructure,
  CachedCategory,
  CachedGroup,
  CachedBlueprint,
  CachedType,
  CachedStructure,
  CachedLocation,
  CachedAbyssal,
  CachedName,
}

export { CategoryIds, LocationFlags } from './constants'

let categoriesCache = new Map<number, CachedCategory>()
let groupsCache = new Map<number, CachedGroup>()
let typesCache = new Map<number, CachedType>()
let regionsCache = new Map<number, CachedRegion>()
let systemsCache = new Map<number, CachedSystem>()
let stationsCache = new Map<number, CachedStation>()
let refStructuresCache = new Map<number, CachedRefStructure>()
let structuresCache = new Map<number, CachedStructure>()
let locationsCache = new Map<number, CachedLocation>()
let abyssalsCache = new Map<number, CachedAbyssal>()
let namesCache = new Map<number, CachedName>()
let blueprintsCache = new Map<number, CachedBlueprint>()
let initialized = false
let referenceDataLoaded = false
let allTypesLoaded = false
let universeDataLoaded = false
let refStructuresLoaded = false
let blueprintsLoaded = false

const ALL_TYPES_LOADED_KEY = 'ecteveassets-all-types-loaded'
const UNIVERSE_LOADED_KEY = 'ecteveassets-universe-loaded'
const REF_STRUCTURES_LOADED_KEY = 'ecteveassets-ref-structures-loaded'
const BLUEPRINTS_LOADED_KEY = 'ecteveassets-blueprints-loaded'

const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let notificationPending = false

function notifyListeners(): void {
  if (notificationPending) return
  notificationPending = true
  queueMicrotask(() => {
    notificationPending = false
    listeners.forEach((fn) => fn())
  })
}

export { notifyListeners as notifyCacheListeners }

export async function initCache(): Promise<void> {
  if (initialized) return

  logger.debug('Initializing reference cache', { module: 'ReferenceCache' })

  try {
    const [
      types,
      regions,
      systems,
      stations,
      refStructures,
      structures,
      locations,
      abyssals,
      names,
      categories,
      groups,
      blueprints,
    ] = await Promise.all([
      loadStore<CachedType>('types'),
      loadStore<CachedRegion>('regions'),
      loadStore<CachedSystem>('systems'),
      loadStore<CachedStation>('stations'),
      loadStore<CachedRefStructure>('refStructures'),
      loadStore<CachedStructure>('structures'),
      loadStore<CachedLocation>('locations'),
      loadStore<CachedAbyssal>('abyssals'),
      loadStore<CachedName>('names'),
      loadStore<CachedCategory>('categories'),
      loadStore<CachedGroup>('groups'),
      loadStore<CachedBlueprint>('blueprints'),
    ])

    typesCache = types
    regionsCache = regions
    systemsCache = systems
    stationsCache = stations
    refStructuresCache = refStructures
    structuresCache = structures
    locationsCache = locations
    abyssalsCache = abyssals
    namesCache = names
    categoriesCache = categories
    groupsCache = groups
    blueprintsCache = blueprints
    initialized = true
    referenceDataLoaded = categoriesCache.size > 0 && groupsCache.size > 0

    try {
      allTypesLoaded =
        localStorage.getItem(ALL_TYPES_LOADED_KEY) === 'true' &&
        typesCache.size > 0
      universeDataLoaded =
        localStorage.getItem(UNIVERSE_LOADED_KEY) === 'true' &&
        regionsCache.size > 0 &&
        systemsCache.size > 0 &&
        stationsCache.size > 0
      refStructuresLoaded =
        localStorage.getItem(REF_STRUCTURES_LOADED_KEY) === 'true' &&
        refStructuresCache.size > 0
      blueprintsLoaded =
        localStorage.getItem(BLUEPRINTS_LOADED_KEY) === 'true' &&
        blueprintsCache.size > 0
    } catch {
      // localStorage not available
    }

    logger.info('Reference cache initialized', {
      module: 'ReferenceCache',
      types: typesCache.size,
      allTypesLoaded,
      regions: regionsCache.size,
      systems: systemsCache.size,
      stations: stationsCache.size,
      refStructures: refStructuresCache.size,
      refStructuresLoaded,
      universeDataLoaded,
      structures: structuresCache.size,
      locations: locationsCache.size,
      abyssals: abyssalsCache.size,
      names: namesCache.size,
      categories: categoriesCache.size,
      groups: groupsCache.size,
      blueprints: blueprintsCache.size,
      blueprintsLoaded,
    })
  } catch (err) {
    logger.error('Failed to initialize cache', err, {
      module: 'ReferenceCache',
    })
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

export function isAllTypesLoaded(): boolean {
  return allTypesLoaded
}

export function setAllTypesLoaded(loaded: boolean): void {
  allTypesLoaded = loaded
  try {
    if (loaded) {
      localStorage.setItem(ALL_TYPES_LOADED_KEY, 'true')
    } else {
      localStorage.removeItem(ALL_TYPES_LOADED_KEY)
    }
  } catch {
    // localStorage not available
  }
}

export function isUniverseDataLoaded(): boolean {
  return universeDataLoaded
}

export function setUniverseDataLoaded(loaded: boolean): void {
  universeDataLoaded = loaded
  try {
    if (loaded) {
      localStorage.setItem(UNIVERSE_LOADED_KEY, 'true')
    } else {
      localStorage.removeItem(UNIVERSE_LOADED_KEY)
    }
  } catch {
    // localStorage not available
  }
}

export function isRefStructuresLoaded(): boolean {
  return refStructuresLoaded
}

export function setRefStructuresLoaded(loaded: boolean): void {
  refStructuresLoaded = loaded
  try {
    if (loaded) {
      localStorage.setItem(REF_STRUCTURES_LOADED_KEY, 'true')
    } else {
      localStorage.removeItem(REF_STRUCTURES_LOADED_KEY)
    }
  } catch {
    // localStorage not available
  }
}

export function getRefStructure(id: number): CachedRefStructure | undefined {
  return refStructuresCache.get(id)
}

export function hasRefStructure(id: number): boolean {
  return refStructuresCache.has(id)
}

export function getRegion(id: number): CachedRegion | undefined {
  return regionsCache.get(id)
}

export function getSystem(id: number): CachedSystem | undefined {
  return systemsCache.get(id)
}

export function getStation(id: number): CachedStation | undefined {
  return stationsCache.get(id)
}

export function hasRegion(id: number): boolean {
  return regionsCache.has(id)
}

export function hasSystem(id: number): boolean {
  return systemsCache.has(id)
}

export function hasStation(id: number): boolean {
  return stationsCache.has(id)
}

export async function setRegions(regions: CachedRegion[]): Promise<void> {
  await writeBatch('regions', regions, () => {
    regionsCache = new Map(regions.map((r) => [r.id, r]))
    logger.info('Regions saved', {
      module: 'ReferenceCache',
      count: regions.length,
    })
  })
}

export async function setSystems(systems: CachedSystem[]): Promise<void> {
  await writeBatch('systems', systems, () => {
    systemsCache = new Map(systems.map((s) => [s.id, s]))
    logger.info('Systems saved', {
      module: 'ReferenceCache',
      count: systems.length,
    })
  })
}

export async function setStations(stations: CachedStation[]): Promise<void> {
  await writeBatch('stations', stations, () => {
    stationsCache = new Map(stations.map((s) => [s.id, s]))
    logger.info('Stations saved', {
      module: 'ReferenceCache',
      count: stations.length,
    })
  })
}

export async function setRefStructures(
  structures: CachedRefStructure[]
): Promise<void> {
  await writeBatch('refStructures', structures, () => {
    refStructuresCache = new Map(structures.map((s) => [s.id, s]))
    logger.info('RefStructures saved', {
      module: 'ReferenceCache',
      count: structures.length,
    })
  })
}

export async function setCategories(
  categories: CachedCategory[]
): Promise<void> {
  await writeBatch('categories', categories, () => {
    categoriesCache = new Map(categories.map((c) => [c.id, c]))
    logger.info('Categories saved', {
      module: 'ReferenceCache',
      count: categories.length,
    })
  })
}

export async function setGroups(groups: CachedGroup[]): Promise<void> {
  await writeBatch('groups', groups, () => {
    groupsCache = new Map(groups.map((g) => [g.id, g]))
    referenceDataLoaded = true
    logger.info('Groups saved', {
      module: 'ReferenceCache',
      count: groups.length,
    })
  })
}

export async function setBlueprints(
  blueprints: CachedBlueprint[]
): Promise<void> {
  await writeBatch('blueprints', blueprints, () => {
    blueprintsCache = new Map(blueprints.map((b) => [b.id, b]))
    logger.info('Blueprints saved', {
      module: 'ReferenceCache',
      count: blueprints.length,
    })
  })
}

export function getBlueprint(id: number): CachedBlueprint | undefined {
  return blueprintsCache.get(id)
}

export function getAllBlueprints(): Map<number, CachedBlueprint> {
  return blueprintsCache
}

export function isBlueprintsLoaded(): boolean {
  return blueprintsLoaded
}

export function setBlueprintsLoaded(loaded: boolean): void {
  blueprintsLoaded = loaded
  try {
    if (loaded) {
      localStorage.setItem(BLUEPRINTS_LOADED_KEY, 'true')
    } else {
      localStorage.removeItem(BLUEPRINTS_LOADED_KEY)
    }
  } catch {
    // localStorage not available
  }
}

export function getStructure(id: number): CachedStructure | undefined {
  return structuresCache.get(id)
}

export function hasStructure(id: number): boolean {
  return structuresCache.has(id)
}

export function getLocation(id: number): CachedLocation | undefined {
  const cached = locationsCache.get(id)
  if (cached) return cached

  const station = stationsCache.get(id)
  if (station) {
    const system = systemsCache.get(station.systemId)
    const region = system ? regionsCache.get(system.regionId) : undefined
    return {
      id,
      name: station.name,
      type: 'station',
      solarSystemId: station.systemId,
      solarSystemName: system?.name,
      regionId: system?.regionId,
      regionName: region?.name,
    }
  }

  const refStructure = refStructuresCache.get(id)
  if (refStructure) {
    const system = refStructure.systemId
      ? systemsCache.get(refStructure.systemId)
      : undefined
    const region = system ? regionsCache.get(system.regionId) : undefined
    return {
      id,
      name: refStructure.name,
      type: 'structure',
      solarSystemId: refStructure.systemId ?? undefined,
      solarSystemName: system?.name,
      regionId: system?.regionId,
      regionName: region?.name,
    }
  }

  const system = systemsCache.get(id)
  if (system) {
    const region = regionsCache.get(system.regionId)
    return {
      id,
      name: system.name,
      type: 'system',
      solarSystemId: id,
      solarSystemName: system.name,
      regionId: system.regionId,
      regionName: region?.name,
    }
  }

  const region = regionsCache.get(id)
  if (region) {
    return {
      id,
      name: region.name,
      type: 'region',
      regionId: id,
      regionName: region.name,
    }
  }

  return undefined
}

export function hasLocation(id: number): boolean {
  return (
    locationsCache.has(id) ||
    stationsCache.has(id) ||
    refStructuresCache.has(id) ||
    systemsCache.has(id) ||
    regionsCache.has(id)
  )
}

export function getLocationName(id: number): string {
  if (id > 1_000_000_000_000) {
    const structure = structuresCache.get(id)
    return structure?.name ?? `Structure ${id}`
  }
  const location = getLocation(id)
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
  await writeBatch('names', names, () => {
    for (const name of names) namesCache.set(name.id, name)
    notifyListeners()
  })
}

export async function saveTypes(types: CachedType[]): Promise<void> {
  await writeBatch('types', types, () => {
    for (const type of types) typesCache.set(type.id, type)
    notifyListeners()
  })
}

export async function saveStructures(
  structures: CachedStructure[]
): Promise<void> {
  await writeBatch('structures', structures, () => {
    for (const structure of structures)
      structuresCache.set(structure.id, structure)
    notifyListeners()
  })
}

export async function saveLocations(
  locations: CachedLocation[]
): Promise<void> {
  await writeBatch('locations', locations, () => {
    for (const location of locations) locationsCache.set(location.id, location)
    notifyListeners()
  })
}

export async function saveAbyssals(abyssals: CachedAbyssal[]): Promise<void> {
  await writeBatch('abyssals', abyssals, () => {
    for (const abyssal of abyssals) abyssalsCache.set(abyssal.id, abyssal)
    notifyListeners()
  })
}

export async function clearReferenceCache(): Promise<void> {
  logger.info('Clearing reference cache', { module: 'ReferenceCache' })

  categoriesCache.clear()
  groupsCache.clear()
  typesCache.clear()
  regionsCache.clear()
  systemsCache.clear()
  stationsCache.clear()
  refStructuresCache.clear()
  structuresCache.clear()
  locationsCache.clear()
  abyssalsCache.clear()
  namesCache.clear()
  blueprintsCache.clear()
  initialized = false
  referenceDataLoaded = false
  setAllTypesLoaded(false)
  setUniverseDataLoaded(false)
  setRefStructuresLoaded(false)
  setBlueprintsLoaded(false)

  await deleteDatabase()
}

export async function clearTypesCache(): Promise<void> {
  logger.info('Clearing types cache', { module: 'ReferenceCache' })
  typesCache.clear()
  setAllTypesLoaded(false)
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

export async function clearUniverseCache(): Promise<void> {
  logger.info('Clearing universe cache', { module: 'ReferenceCache' })
  regionsCache.clear()
  systemsCache.clear()
  stationsCache.clear()
  refStructuresCache.clear()
  setUniverseDataLoaded(false)
  setRefStructuresLoaded(false)
  await Promise.all([
    clearStore('regions'),
    clearStore('systems'),
    clearStore('stations'),
    clearStore('refStructures'),
  ])
  notifyListeners()
}

export async function clearBlueprintsCache(): Promise<void> {
  logger.info('Clearing blueprints cache', { module: 'ReferenceCache' })
  blueprintsCache.clear()
  setBlueprintsLoaded(false)
  await clearStore('blueprints')
  notifyListeners()
}

export async function clearCoreReferenceCache(): Promise<void> {
  logger.info('Clearing core reference cache', { module: 'ReferenceCache' })
  typesCache.clear()
  categoriesCache.clear()
  groupsCache.clear()
  blueprintsCache.clear()
  referenceDataLoaded = false
  setAllTypesLoaded(false)
  setBlueprintsLoaded(false)
  await Promise.all([
    clearStore('types'),
    clearStore('categories'),
    clearStore('groups'),
    clearStore('blueprints'),
  ])
  notifyListeners()
}
