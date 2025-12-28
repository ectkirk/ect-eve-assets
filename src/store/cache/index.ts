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
const REFERENCE_SCHEMA_VERSION_KEY = 'ecteveassets-reference-schema-version'
const REFERENCE_SCHEMA_VERSION = 1

interface ReferenceCacheState {
  types: Map<number, CachedType>
  typesVersion: number
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
    typesVersion: 0,
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

          let finalCategories = categories
          let finalGroups = groups
          if (categories.size > 0 || groups.size > 0) {
            const storedVersion = getLocalStorage(REFERENCE_SCHEMA_VERSION_KEY)
            if (storedVersion !== String(REFERENCE_SCHEMA_VERSION)) {
              logger.info('Reference schema version changed, clearing cache', {
                module: 'ReferenceCache',
                oldVersion: storedVersion,
                newVersion: REFERENCE_SCHEMA_VERSION,
              })
              finalCategories = new Map()
              finalGroups = new Map()
              await Promise.all([
                clearStore('categories'),
                clearStore('groups'),
              ])
              setLocalStorage(REFERENCE_SCHEMA_VERSION_KEY, null)
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
            categories: finalCategories,
            groups: finalGroups,
            initialized: true,
            referenceDataLoaded:
              finalCategories.size > 0 && finalGroups.size > 0,
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
            categories: finalCategories.size,
            groups: finalGroups.size,
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
        set((s) => ({ types: updated, typesVersion: s.typesVersion + 1 }))
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
        setLocalStorage(
          REFERENCE_SCHEMA_VERSION_KEY,
          String(REFERENCE_SCHEMA_VERSION)
        )
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
      set({ types: new Map(), typesVersion: 0 })
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
        typesVersion: 0,
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
        typesVersion: 0,
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

export * from './getters'
export * from './hooks'
