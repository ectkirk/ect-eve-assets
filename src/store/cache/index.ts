import { create } from 'zustand'
import { logger } from '@/lib/logger'
import { loadStore, writeBatch, clearStore, deleteDatabase } from './db'
import type {
  CachedRegion,
  CachedSystem,
  CachedStation,
  CachedRefStructure,
  CachedCategory,
  CachedGroup,
  CachedType,
  CachedStructure,
  CachedLocation,
  CachedName,
} from './types'

export type {
  CachedRegion,
  CachedSystem,
  CachedStation,
  CachedRefStructure,
  CachedCategory,
  CachedGroup,
  CachedType,
  CachedStructure,
  CachedLocation,
  CachedName,
}

export { CategoryIds, LocationFlags } from './constants'

const ALL_TYPES_LOADED_KEY = 'ecteveassets-all-types-loaded'
const UNIVERSE_LOADED_KEY = 'ecteveassets-universe-loaded'
const REF_STRUCTURES_LOADED_KEY = 'ecteveassets-ref-structures-loaded'
const TYPES_SCHEMA_VERSION_KEY = 'ecteveassets-types-schema-version'
const TYPES_SCHEMA_VERSION = 3

interface ReferenceCacheState {
  types: Map<number, CachedType>
  categories: Map<number, CachedCategory>
  groups: Map<number, CachedGroup>
  regions: Map<number, CachedRegion>
  systems: Map<number, CachedSystem>
  stations: Map<number, CachedStation>
  refStructures: Map<number, CachedRefStructure>
  structures: Map<number, CachedStructure>
  locations: Map<number, CachedLocation>
  names: Map<number, CachedName>

  initialized: boolean
  referenceDataLoaded: boolean
  allTypesLoaded: boolean
  universeDataLoaded: boolean
  refStructuresLoaded: boolean
}

interface ReferenceCacheActions {
  init: () => Promise<void>

  saveTypes: (types: CachedType[]) => Promise<void>
  setCategories: (categories: CachedCategory[]) => Promise<void>
  setGroups: (groups: CachedGroup[]) => Promise<void>
  setRegions: (regions: CachedRegion[]) => Promise<void>
  setSystems: (systems: CachedSystem[]) => Promise<void>
  setStations: (stations: CachedStation[]) => Promise<void>
  setRefStructures: (structures: CachedRefStructure[]) => Promise<void>
  saveStructures: (structures: CachedStructure[]) => Promise<void>
  saveLocations: (locations: CachedLocation[]) => Promise<void>
  saveNames: (names: CachedName[]) => Promise<void>

  updateTypePrices: (
    prices: Array<{ id: number; jitaPrice: number }>
  ) => Promise<void>
  updateTypeEsiPrices: (
    prices: Array<{
      id: number
      esiAveragePrice: number | null
      esiAdjustedPrice: number | null
    }>
  ) => Promise<void>
  clearJitaPrices: () => void
  clearEsiPrices: () => void
  clearTypePrices: () => void

  setAllTypesLoaded: (loaded: boolean) => void
  setUniverseDataLoaded: (loaded: boolean) => void
  setRefStructuresLoaded: (loaded: boolean) => void

  clearTypesCache: () => Promise<void>
  clearLocationsCache: () => Promise<void>
  clearStructuresCache: () => Promise<void>
  clearNamesCache: () => Promise<void>
  clearCategoriesCache: () => Promise<void>
  clearGroupsCache: () => Promise<void>
  clearUniverseCache: () => Promise<void>
  clearCoreReferenceCache: () => Promise<void>
  clearReferenceCache: () => Promise<void>
}

type ReferenceCacheStore = ReferenceCacheState & ReferenceCacheActions

function setLocalStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch (err) {
    logger.warn('localStorage not available', {
      module: 'ReferenceCache',
      key,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function getLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

let initPromise: Promise<void> | null = null

export const useReferenceCacheStore = create<ReferenceCacheStore>(
  (set, get) => ({
    types: new Map(),
    categories: new Map(),
    groups: new Map(),
    regions: new Map(),
    systems: new Map(),
    stations: new Map(),
    refStructures: new Map(),
    structures: new Map(),
    locations: new Map(),
    names: new Map(),

    initialized: false,
    referenceDataLoaded: false,
    allTypesLoaded: false,
    universeDataLoaded: false,
    refStructuresLoaded: false,

    init: async () => {
      if (get().initialized) return
      if (initPromise) return initPromise

      initPromise = (async () => {
        try {
          const [
            types,
            regions,
            systems,
            stations,
            refStructures,
            structures,
            locations,
            names,
            categories,
            groups,
          ] = await Promise.all([
            loadStore<CachedType>('types'),
            loadStore<CachedRegion>('regions'),
            loadStore<CachedSystem>('systems'),
            loadStore<CachedStation>('stations'),
            loadStore<CachedRefStructure>('refStructures'),
            loadStore<CachedStructure>('structures'),
            loadStore<CachedLocation>('locations'),
            loadStore<CachedName>('names'),
            loadStore<CachedCategory>('categories'),
            loadStore<CachedGroup>('groups'),
          ])

          let finalTypes = types
          if (types.size > 0) {
            const storedVersion = getLocalStorage(TYPES_SCHEMA_VERSION_KEY)
            if (storedVersion !== String(TYPES_SCHEMA_VERSION)) {
              logger.info('Types schema version changed, clearing cache', {
                module: 'ReferenceCache',
                oldVersion: storedVersion,
                newVersion: TYPES_SCHEMA_VERSION,
              })
              finalTypes = new Map()
              await clearStore('types')
              setLocalStorage(ALL_TYPES_LOADED_KEY, null)
              setLocalStorage(TYPES_SCHEMA_VERSION_KEY, null)
            }
          }

          const allTypesLoaded =
            getLocalStorage(ALL_TYPES_LOADED_KEY) === 'true' &&
            finalTypes.size > 0
          const universeDataLoaded =
            getLocalStorage(UNIVERSE_LOADED_KEY) === 'true' &&
            regions.size > 0 &&
            systems.size > 0 &&
            stations.size > 0
          const refStructuresLoaded =
            getLocalStorage(REF_STRUCTURES_LOADED_KEY) === 'true' &&
            refStructures.size > 0

          set({
            types: finalTypes,
            regions,
            systems,
            stations,
            refStructures,
            structures,
            locations,
            names,
            categories,
            groups,
            initialized: true,
            referenceDataLoaded: categories.size > 0 && groups.size > 0,
            allTypesLoaded,
            universeDataLoaded,
            refStructuresLoaded,
          })

          logger.info('Reference cache initialized', {
            module: 'ReferenceCache',
            types: finalTypes.size,
            allTypesLoaded,
            regions: regions.size,
            systems: systems.size,
            stations: stations.size,
            refStructures: refStructures.size,
            refStructuresLoaded,
            universeDataLoaded,
            structures: structures.size,
            locations: locations.size,
            names: names.size,
            categories: categories.size,
            groups: groups.size,
          })
        } catch (err) {
          logger.error('Failed to initialize cache', err, {
            module: 'ReferenceCache',
          })
          set({ initialized: true })
        }
      })()

      return initPromise
    },

    saveTypes: async (newTypes) => {
      if (newTypes.length === 0) return
      const current = get().types
      const updated = new Map(current)
      for (const type of newTypes) updated.set(type.id, type)

      await writeBatch('types', newTypes, () => {
        set({ types: updated })
      })
    },

    setCategories: async (newCategories) => {
      await writeBatch('categories', newCategories, () => {
        set({ categories: new Map(newCategories.map((c) => [c.id, c])) })
        logger.info('Categories saved', {
          module: 'ReferenceCache',
          count: newCategories.length,
        })
      })
    },

    setGroups: async (newGroups) => {
      await writeBatch('groups', newGroups, () => {
        set({
          groups: new Map(newGroups.map((g) => [g.id, g])),
          referenceDataLoaded: true,
        })
        logger.info('Groups saved', {
          module: 'ReferenceCache',
          count: newGroups.length,
        })
      })
    },

    setRegions: async (newRegions) => {
      await writeBatch('regions', newRegions, () => {
        set({ regions: new Map(newRegions.map((r) => [r.id, r])) })
        logger.info('Regions saved', {
          module: 'ReferenceCache',
          count: newRegions.length,
        })
      })
    },

    setSystems: async (newSystems) => {
      await writeBatch('systems', newSystems, () => {
        set({ systems: new Map(newSystems.map((s) => [s.id, s])) })
        logger.info('Systems saved', {
          module: 'ReferenceCache',
          count: newSystems.length,
        })
      })
    },

    setStations: async (newStations) => {
      await writeBatch('stations', newStations, () => {
        set({ stations: new Map(newStations.map((s) => [s.id, s])) })
        logger.info('Stations saved', {
          module: 'ReferenceCache',
          count: newStations.length,
        })
      })
    },

    setRefStructures: async (newStructures) => {
      await writeBatch('refStructures', newStructures, () => {
        set({ refStructures: new Map(newStructures.map((s) => [s.id, s])) })
        logger.info('RefStructures saved', {
          module: 'ReferenceCache',
          count: newStructures.length,
        })
      })
    },

    saveStructures: async (newStructures) => {
      if (newStructures.length === 0) return
      const current = get().structures
      const updated = new Map(current)
      for (const structure of newStructures)
        updated.set(structure.id, structure)

      await writeBatch('structures', newStructures, () => {
        set({ structures: updated })
      })
    },

    saveLocations: async (newLocations) => {
      if (newLocations.length === 0) return
      const current = get().locations
      const updated = new Map(current)
      for (const location of newLocations) updated.set(location.id, location)

      await writeBatch('locations', newLocations, () => {
        set({ locations: updated })
      })
    },

    saveNames: async (newNames) => {
      if (newNames.length === 0) return
      const current = get().names
      const updated = new Map(current)
      for (const name of newNames) updated.set(name.id, name)

      await writeBatch('names', newNames, () => {
        set({ names: updated })
      })
    },

    updateTypePrices: async (prices) => {
      if (prices.length === 0) return
      const current = get().types
      const updated = new Map(current)
      const toWrite: CachedType[] = []

      for (const { id, jitaPrice } of prices) {
        const type = current.get(id)
        if (type) {
          const newType = { ...type, jitaPrice }
          updated.set(id, newType)
          toWrite.push(newType)
        }
      }

      if (toWrite.length > 0) {
        await writeBatch('types', toWrite, () => {
          set({ types: updated })
        })
      }
    },

    updateTypeEsiPrices: async (prices) => {
      if (prices.length === 0) return
      const current = get().types
      const updated = new Map(current)
      const toWrite: CachedType[] = []

      for (const { id, esiAveragePrice, esiAdjustedPrice } of prices) {
        const type = current.get(id)
        if (type) {
          const newType = {
            ...type,
            esiAveragePrice: esiAveragePrice ?? undefined,
            esiAdjustedPrice: esiAdjustedPrice ?? undefined,
          }
          updated.set(id, newType)
          toWrite.push(newType)
        }
      }

      if (toWrite.length > 0) {
        await writeBatch('types', toWrite, () => {
          set({ types: updated })
        })
      }
    },

    clearJitaPrices: () => {
      const current = get().types
      const updated = new Map<number, CachedType>()
      for (const [id, type] of current) {
        if (type.jitaPrice !== undefined) {
          updated.set(id, { ...type, jitaPrice: undefined })
        } else {
          updated.set(id, type)
        }
      }
      set({ types: updated })
    },

    clearEsiPrices: () => {
      const current = get().types
      const updated = new Map<number, CachedType>()
      for (const [id, type] of current) {
        if (
          type.esiAveragePrice !== undefined ||
          type.esiAdjustedPrice !== undefined
        ) {
          updated.set(id, {
            ...type,
            esiAveragePrice: undefined,
            esiAdjustedPrice: undefined,
          })
        } else {
          updated.set(id, type)
        }
      }
      set({ types: updated })
    },

    clearTypePrices: () => {
      const current = get().types
      const updated = new Map<number, CachedType>()
      for (const [id, type] of current) {
        if (
          type.jitaPrice !== undefined ||
          type.esiAveragePrice !== undefined ||
          type.esiAdjustedPrice !== undefined
        ) {
          updated.set(id, {
            ...type,
            jitaPrice: undefined,
            esiAveragePrice: undefined,
            esiAdjustedPrice: undefined,
          })
        } else {
          updated.set(id, type)
        }
      }
      set({ types: updated })
    },

    setAllTypesLoaded: (loaded) => {
      set({ allTypesLoaded: loaded })
      if (loaded) {
        setLocalStorage(ALL_TYPES_LOADED_KEY, 'true')
        setLocalStorage(TYPES_SCHEMA_VERSION_KEY, String(TYPES_SCHEMA_VERSION))
      } else {
        setLocalStorage(ALL_TYPES_LOADED_KEY, null)
        setLocalStorage(TYPES_SCHEMA_VERSION_KEY, null)
      }
    },

    setUniverseDataLoaded: (loaded) => {
      set({ universeDataLoaded: loaded })
      setLocalStorage(UNIVERSE_LOADED_KEY, loaded ? 'true' : null)
    },

    setRefStructuresLoaded: (loaded) => {
      set({ refStructuresLoaded: loaded })
      setLocalStorage(REF_STRUCTURES_LOADED_KEY, loaded ? 'true' : null)
    },

    clearTypesCache: async () => {
      logger.info('Clearing types cache', { module: 'ReferenceCache' })
      get().setAllTypesLoaded(false)
      await clearStore('types')
      set({ types: new Map() })
    },

    clearLocationsCache: async () => {
      logger.info('Clearing locations cache', { module: 'ReferenceCache' })
      await clearStore('locations')
      set({ locations: new Map() })
    },

    clearStructuresCache: async () => {
      logger.info('Clearing structures cache', { module: 'ReferenceCache' })
      await clearStore('structures')
      set({ structures: new Map() })
    },

    clearNamesCache: async () => {
      logger.info('Clearing names cache', { module: 'ReferenceCache' })
      await clearStore('names')
      set({ names: new Map() })
    },

    clearCategoriesCache: async () => {
      logger.info('Clearing categories cache', { module: 'ReferenceCache' })
      await clearStore('categories')
      set({ categories: new Map() })
    },

    clearGroupsCache: async () => {
      logger.info('Clearing groups cache', { module: 'ReferenceCache' })
      await clearStore('groups')
      set({ groups: new Map(), referenceDataLoaded: false })
    },

    clearUniverseCache: async () => {
      logger.info('Clearing universe cache', { module: 'ReferenceCache' })
      get().setUniverseDataLoaded(false)
      get().setRefStructuresLoaded(false)
      await Promise.all([
        clearStore('regions'),
        clearStore('systems'),
        clearStore('stations'),
        clearStore('refStructures'),
      ])
      set({
        regions: new Map(),
        systems: new Map(),
        stations: new Map(),
        refStructures: new Map(),
      })
    },

    clearCoreReferenceCache: async () => {
      logger.info('Clearing core reference cache', { module: 'ReferenceCache' })
      get().setAllTypesLoaded(false)
      await Promise.all([
        clearStore('types'),
        clearStore('categories'),
        clearStore('groups'),
      ])
      set({
        types: new Map(),
        categories: new Map(),
        groups: new Map(),
        referenceDataLoaded: false,
      })
    },

    clearReferenceCache: async () => {
      logger.info('Clearing reference cache', { module: 'ReferenceCache' })
      get().setAllTypesLoaded(false)
      get().setUniverseDataLoaded(false)
      get().setRefStructuresLoaded(false)
      initPromise = null

      await deleteDatabase()

      set({
        types: new Map(),
        categories: new Map(),
        groups: new Map(),
        regions: new Map(),
        systems: new Map(),
        stations: new Map(),
        refStructures: new Map(),
        structures: new Map(),
        locations: new Map(),
        names: new Map(),
        initialized: false,
        referenceDataLoaded: false,
      })
    },
  })
)

// Convenience getters for non-reactive contexts (event handlers, async code)
// For reactive use in components, use useReferenceCacheStore selectors directly

export function getType(id: number): CachedType | undefined {
  return useReferenceCacheStore.getState().types.get(id)
}

export function getTypeName(id: number): string {
  return (
    useReferenceCacheStore.getState().types.get(id)?.name ??
    `Unknown Type ${id}`
  )
}

export function hasType(id: number): boolean {
  return useReferenceCacheStore.getState().types.has(id)
}

export function isTypePublished(id: number): boolean {
  const type = useReferenceCacheStore.getState().types.get(id)
  return type?.published === true
}

export function isTypeMarketable(id: number): boolean {
  const type = useReferenceCacheStore.getState().types.get(id)
  // null = explicitly not marketable, undefined = unknown (assume marketable for backwards compat)
  return type?.marketGroupId !== null
}

export function getTypeJitaPrice(id: number): number | undefined {
  return useReferenceCacheStore.getState().types.get(id)?.jitaPrice
}

export function getTypeEsiAveragePrice(id: number): number | undefined {
  return useReferenceCacheStore.getState().types.get(id)?.esiAveragePrice
}

export function getTypeEsiAdjustedPrice(id: number): number | undefined {
  return useReferenceCacheStore.getState().types.get(id)?.esiAdjustedPrice
}

export function getTypeBasePrice(id: number): number | undefined {
  return useReferenceCacheStore.getState().types.get(id)?.basePrice
}

export function getTypeProductId(id: number): number | undefined {
  return useReferenceCacheStore.getState().types.get(id)?.productId
}

export function isTypeBlueprint(id: number): boolean {
  return (
    useReferenceCacheStore.getState().types.get(id)?.productId !== undefined
  )
}

export function getCategory(id: number): CachedCategory | undefined {
  return useReferenceCacheStore.getState().categories.get(id)
}

export function getGroup(id: number): CachedGroup | undefined {
  return useReferenceCacheStore.getState().groups.get(id)
}

export function isReferenceDataLoaded(): boolean {
  return useReferenceCacheStore.getState().referenceDataLoaded
}

export function isAllTypesLoaded(): boolean {
  return useReferenceCacheStore.getState().allTypesLoaded
}

export function isUniverseDataLoaded(): boolean {
  return useReferenceCacheStore.getState().universeDataLoaded
}

export function isRefStructuresLoaded(): boolean {
  return useReferenceCacheStore.getState().refStructuresLoaded
}

export function getRefStructure(id: number): CachedRefStructure | undefined {
  return useReferenceCacheStore.getState().refStructures.get(id)
}

export function hasRefStructure(id: number): boolean {
  return useReferenceCacheStore.getState().refStructures.has(id)
}

export function getRegion(id: number): CachedRegion | undefined {
  return useReferenceCacheStore.getState().regions.get(id)
}

export function getSystem(id: number): CachedSystem | undefined {
  return useReferenceCacheStore.getState().systems.get(id)
}

export function getStation(id: number): CachedStation | undefined {
  return useReferenceCacheStore.getState().stations.get(id)
}

export function hasRegion(id: number): boolean {
  return useReferenceCacheStore.getState().regions.has(id)
}

export function hasSystem(id: number): boolean {
  return useReferenceCacheStore.getState().systems.has(id)
}

export function hasStation(id: number): boolean {
  return useReferenceCacheStore.getState().stations.has(id)
}

export function getStructure(id: number): CachedStructure | undefined {
  return useReferenceCacheStore.getState().structures.get(id)
}

export function hasStructure(id: number): boolean {
  return useReferenceCacheStore.getState().structures.has(id)
}

export function getLocation(id: number): CachedLocation | undefined {
  const state = useReferenceCacheStore.getState()
  const cached = state.locations.get(id)
  if (cached) return cached

  const station = state.stations.get(id)
  if (station) {
    const system = state.systems.get(station.systemId)
    const region = system ? state.regions.get(system.regionId) : undefined
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

  const refStructure = state.refStructures.get(id)
  if (refStructure) {
    const system = refStructure.systemId
      ? state.systems.get(refStructure.systemId)
      : undefined
    const region = system ? state.regions.get(system.regionId) : undefined
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

  const system = state.systems.get(id)
  if (system) {
    const region = state.regions.get(system.regionId)
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

  const region = state.regions.get(id)
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
  const state = useReferenceCacheStore.getState()
  return (
    state.locations.has(id) ||
    state.stations.has(id) ||
    state.refStructures.has(id) ||
    state.systems.has(id) ||
    state.regions.has(id)
  )
}

export function getLocationName(id: number): string {
  const state = useReferenceCacheStore.getState()
  if (id > 1_000_000_000_000) {
    const structure = state.structures.get(id)
    return structure?.name ?? `Structure ${id}`
  }
  const location = getLocation(id)
  return location?.name ?? `Location ${id}`
}

export function getName(id: number): CachedName | undefined {
  return useReferenceCacheStore.getState().names.get(id)
}

export function hasName(id: number): boolean {
  return useReferenceCacheStore.getState().names.has(id)
}

export function getAllCategories(publishedOnly = false): CachedCategory[] {
  const all = Array.from(useReferenceCacheStore.getState().categories.values())
  return publishedOnly ? all.filter((c) => c.published === true) : all
}

export function getAllGroups(publishedOnly = false): CachedGroup[] {
  const all = Array.from(useReferenceCacheStore.getState().groups.values())
  return publishedOnly ? all.filter((g) => g.published === true) : all
}

export function getGroupsByCategory(
  categoryId: number,
  publishedOnly = false
): CachedGroup[] {
  return Array.from(useReferenceCacheStore.getState().groups.values()).filter(
    (g) =>
      g.categoryId === categoryId && (!publishedOnly || g.published === true)
  )
}

export function getAllRegions(): CachedRegion[] {
  return Array.from(useReferenceCacheStore.getState().regions.values())
}
