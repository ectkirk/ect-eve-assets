import { create } from 'zustand'
import { getRegionalSellOrders, getStructureOrders, DEFAULT_REGION_ID } from '@/api/endpoints/market'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { logger } from '@/lib/logger'

const CACHE_TTL_MS = 5 * 60 * 1000
const OWNER_KEY = 'regional-market'
const ENDPOINT_PATTERN = '/markets/regional/'
const PARALLEL_LIMIT = 10
const DB_NAME = 'ecteveassets-regional-market'
const DB_VERSION = 2
const STORE_PRICES = 'prices'
const STORE_TRACKED = 'tracked'
const STORE_STRUCTURES = 'structures'

interface PriceRecord {
  typeId: number
  lowestPrice: number | null
  locationPrices: Record<number, number>
  lastFetchAt: number
}

interface TrackedRecord {
  key: string
  typeId: number
  regionId: number
}

interface TrackedStructureRecord {
  structureId: number
  characterId: number
  typeIds: number[]
  lastFetchAt: number
}

interface RegionalMarketState {
  pricesByType: Map<number, number>
  pricesByLocation: Map<number, Map<number, number>>
  lastFetchAt: Map<string, number>
  trackedTypes: Map<string, { typeId: number; regionId: number }>
  trackedStructures: Map<number, { characterId: number; typeIds: Set<number>; lastFetchAt: number }>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface RegionalMarketActions {
  init: () => Promise<void>
  update: () => Promise<void>
  registerTypes: (typeIds: number[], regionIds: number[]) => void
  registerStructures: (structureIds: number[], typeIds: number[], characterId: number) => void
  untrackTypes: (typeIds: number[]) => Promise<void>
  untrackStructures: (structureIds: number[]) => Promise<void>
  getPrice: (typeId: number) => number | undefined
  getPriceAtLocation: (typeId: number, locationId: number) => number | undefined
  clear: () => Promise<void>
}

type RegionalMarketStore = RegionalMarketState & RegionalMarketActions

function cacheKey(regionId: number, typeId: number): string {
  return `${regionId}:${typeId}`
}

function deepClonePricesByLocation(
  original: Map<number, Map<number, number>>
): Map<number, Map<number, number>> {
  const clone = new Map<number, Map<number, number>>()
  for (const [typeId, locationMap] of original) {
    clone.set(typeId, new Map(locationMap))
  }
  return clone
}

function updateLocationPrice(
  pricesByLocation: Map<number, Map<number, number>>,
  pricesByType: Map<number, number>,
  priceUpdates: Map<number, PriceRecord>,
  typeId: number,
  locationId: number,
  price: number,
  fetchTime: number
): void {
  let typeLocationMap = pricesByLocation.get(typeId)
  if (!typeLocationMap) {
    typeLocationMap = new Map()
    pricesByLocation.set(typeId, typeLocationMap)
  }
  typeLocationMap.set(locationId, price)

  if (typeLocationMap.size > 0) {
    pricesByType.set(typeId, Math.min(...typeLocationMap.values()))
  } else {
    pricesByType.delete(typeId)
  }

  const locationPricesObj: Record<number, number> = {}
  for (const [locId, p] of typeLocationMap) {
    locationPricesObj[locId] = p
  }

  priceUpdates.set(typeId, {
    typeId,
    lowestPrice: pricesByType.get(typeId) ?? null,
    locationPrices: locationPricesObj,
    lastFetchAt: fetchTime,
  })
}

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open regional market DB', request.error, { module: 'RegionalMarketStore' })
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

async function loadFromDB(): Promise<{
  prices: PriceRecord[]
  tracked: TrackedRecord[]
  structures: TrackedStructureRecord[]
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_PRICES, STORE_TRACKED, STORE_STRUCTURES], 'readonly')
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

async function savePricesToDB(records: PriceRecord[]): Promise<void> {
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

async function saveTrackedToDB(records: TrackedRecord[]): Promise<void> {
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

async function deleteTrackedFromDB(keys: string[]): Promise<void> {
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

async function deletePricesFromDB(typeIds: number[]): Promise<void> {
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

async function saveStructureToDB(record: TrackedStructureRecord): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_STRUCTURES], 'readwrite')
    const store = tx.objectStore(STORE_STRUCTURES)
    store.put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteStructuresFromDB(structureIds: number[]): Promise<void> {
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

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_PRICES, STORE_TRACKED, STORE_STRUCTURES], 'readwrite')
    tx.objectStore(STORE_PRICES).clear()
    tx.objectStore(STORE_TRACKED).clear()
    tx.objectStore(STORE_STRUCTURES).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useRegionalMarketStore = create<RegionalMarketStore>((set, get) => ({
  pricesByType: new Map(),
  pricesByLocation: new Map(),
  lastFetchAt: new Map(),
  trackedTypes: new Map(),
  trackedStructures: new Map(),
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { prices, tracked, structures } = await loadFromDB()

      const pricesByType = new Map<number, number>()
      const pricesByLocation = new Map<number, Map<number, number>>()
      const lastFetchAt = new Map<string, number>()
      const trackedTypes = new Map<string, { typeId: number; regionId: number }>()
      const trackedStructures = new Map<number, { characterId: number; typeIds: Set<number>; lastFetchAt: number }>()

      const lastFetchByType = new Map<number, number>()

      for (const record of prices) {
        if (record.lowestPrice !== null) {
          pricesByType.set(record.typeId, record.lowestPrice)
        }

        if (Object.keys(record.locationPrices).length > 0) {
          const locationMap = new Map<number, number>()
          for (const [locId, price] of Object.entries(record.locationPrices)) {
            locationMap.set(Number(locId), price)
          }
          pricesByLocation.set(record.typeId, locationMap)
        }

        lastFetchByType.set(record.typeId, record.lastFetchAt)
      }

      for (const record of tracked) {
        trackedTypes.set(record.key, { typeId: record.typeId, regionId: record.regionId })
        const fetchTime = lastFetchByType.get(record.typeId)
        if (fetchTime !== undefined) {
          lastFetchAt.set(record.key, fetchTime)
        }
      }

      for (const record of structures) {
        trackedStructures.set(record.structureId, {
          characterId: record.characterId,
          typeIds: new Set(record.typeIds),
          lastFetchAt: record.lastFetchAt,
        })
      }

      set({
        pricesByType,
        pricesByLocation,
        lastFetchAt,
        trackedTypes,
        trackedStructures,
        initialized: true,
      })

      logger.info('Regional market store initialized', {
        module: 'RegionalMarketStore',
        types: pricesByType.size,
        tracked: trackedTypes.size,
        structures: trackedStructures.size,
      })

      get().update()
    } catch (err) {
      logger.error('Failed to load regional market from DB', err instanceof Error ? err : undefined, {
        module: 'RegionalMarketStore',
      })
      set({ initialized: true })
    }
  },

  update: async () => {
    const state = get()
    if (!state.initialized) {
      await get().init()
      return
    }
    if (state.isUpdating) return
    if (state.trackedTypes.size === 0 && state.trackedStructures.size === 0) return

    const now = Date.now()
    const regionalTasks: { regionId: number; typeId: number }[] = []
    const structureTasks: { structureId: number; characterId: number; typeIds: Set<number> }[] = []
    let earliestExpiry = Infinity

    for (const [key, { typeId, regionId }] of state.trackedTypes) {
      const lastFetch = state.lastFetchAt.get(key)
      if (!lastFetch || now - lastFetch > CACHE_TTL_MS) {
        regionalTasks.push({ regionId, typeId })
      } else {
        const expiresAt = lastFetch + CACHE_TTL_MS
        if (expiresAt < earliestExpiry) {
          earliestExpiry = expiresAt
        }
      }
    }

    for (const [structureId, { characterId, typeIds, lastFetchAt: structureLastFetch }] of state.trackedStructures) {
      if (!structureLastFetch || now - structureLastFetch > CACHE_TTL_MS) {
        structureTasks.push({ structureId, characterId, typeIds })
      } else {
        const expiresAt = structureLastFetch + CACHE_TTL_MS
        if (expiresAt < earliestExpiry) {
          earliestExpiry = expiresAt
        }
      }
    }

    if (regionalTasks.length === 0 && structureTasks.length === 0) {
      if (earliestExpiry < Infinity) {
        useExpiryCacheStore.getState().setExpiry(OWNER_KEY, ENDPOINT_PATTERN, earliestExpiry)
      }
      return
    }

    set({ isUpdating: true, updateError: null })

    const pricesByType = new Map(state.pricesByType)
    const pricesByLocation = deepClonePricesByLocation(state.pricesByLocation)
    const lastFetchAt = new Map(state.lastFetchAt)
    const trackedStructures = new Map(state.trackedStructures)

    const priceUpdates = new Map<number, PriceRecord>()
    const structureUpdates: TrackedStructureRecord[] = []

    const processRegionalBatch = async (batch: typeof regionalTasks) => {
      await Promise.all(
        batch.map(async ({ regionId, typeId }) => {
          try {
            const orders = await getRegionalSellOrders(regionId, typeId)
            const key = cacheKey(regionId, typeId)
            const fetchTime = Date.now()
            lastFetchAt.set(key, fetchTime)

            const lowestByLocation = new Map<number, number>()
            for (const order of orders) {
              const current = lowestByLocation.get(order.location_id)
              if (!current || order.price < current) {
                lowestByLocation.set(order.location_id, order.price)
              }
            }

            for (const [locationId, price] of lowestByLocation) {
              updateLocationPrice(pricesByLocation, pricesByType, priceUpdates, typeId, locationId, price, fetchTime)
            }
          } catch (err) {
            logger.warn('Failed to fetch regional orders', {
              module: 'RegionalMarketStore',
              regionId,
              typeId,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        })
      )
    }

    const processStructure = async (structureId: number, characterId: number, typeIds: Set<number>) => {
      try {
        const orders = await getStructureOrders(structureId, characterId)
        const fetchTime = Date.now()

        const lowestByType = new Map<number, number>()
        for (const order of orders) {
          if (order.is_buy_order) continue
          if (!typeIds.has(order.type_id)) continue

          const current = lowestByType.get(order.type_id)
          if (!current || order.price < current) {
            lowestByType.set(order.type_id, order.price)
          }
        }

        for (const [typeId, price] of lowestByType) {
          updateLocationPrice(pricesByLocation, pricesByType, priceUpdates, typeId, structureId, price, fetchTime)
        }

        const existing = trackedStructures.get(structureId)
        if (existing) {
          trackedStructures.set(structureId, { ...existing, lastFetchAt: fetchTime })
          structureUpdates.push({
            structureId,
            characterId,
            typeIds: Array.from(existing.typeIds),
            lastFetchAt: fetchTime,
          })
        }

        logger.debug('Fetched structure market', {
          module: 'RegionalMarketStore',
          structureId,
          types: lowestByType.size,
        })
      } catch (err) {
        logger.warn('Failed to fetch structure orders', {
          module: 'RegionalMarketStore',
          structureId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    try {
      for (let i = 0; i < regionalTasks.length; i += PARALLEL_LIMIT) {
        const batch = regionalTasks.slice(i, i + PARALLEL_LIMIT)
        await processRegionalBatch(batch)
      }

      for (const { structureId, characterId, typeIds } of structureTasks) {
        await processStructure(structureId, characterId, typeIds)
      }

      await savePricesToDB(Array.from(priceUpdates.values()))
      for (const record of structureUpdates) {
        await saveStructureToDB(record)
      }

      set({
        pricesByType,
        pricesByLocation,
        lastFetchAt,
        trackedStructures,
        isUpdating: false,
      })

      if (get().trackedTypes.size > 0 || get().trackedStructures.size > 0) {
        useExpiryCacheStore.getState().setExpiry(
          OWNER_KEY,
          ENDPOINT_PATTERN,
          Date.now() + CACHE_TTL_MS
        )
      }

      logger.info('Regional prices updated', {
        module: 'RegionalMarketStore',
        regionalTasks: regionalTasks.length,
        structureTasks: structureTasks.length,
        updated: priceUpdates.size,
      })
    } catch (err) {
      set({
        isUpdating: false,
        updateError: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  },

  registerTypes: (typeIds: number[], regionIds: number[]) => {
    const state = get()
    const allRegions = new Set(regionIds)
    allRegions.add(DEFAULT_REGION_ID)

    const newTracked: TrackedRecord[] = []
    const trackedTypes = new Map(state.trackedTypes)

    for (const regionId of allRegions) {
      for (const typeId of typeIds) {
        const key = cacheKey(regionId, typeId)
        if (!trackedTypes.has(key)) {
          trackedTypes.set(key, { typeId, regionId })
          newTracked.push({ key, typeId, regionId })
        }
      }
    }

    if (newTracked.length > 0) {
      set({ trackedTypes })
      saveTrackedToDB(newTracked).catch((err) => {
        logger.error('Failed to save tracked types', err instanceof Error ? err : undefined, {
          module: 'RegionalMarketStore',
        })
      })

      if (state.initialized && !state.isUpdating) {
        get().update()
      }
    }
  },

  untrackTypes: async (typeIds: number[]) => {
    if (typeIds.length === 0) return

    const state = get()
    const typeIdSet = new Set(typeIds)

    const keysToDelete: string[] = []
    const trackedTypes = new Map(state.trackedTypes)
    const pricesByType = new Map(state.pricesByType)
    const pricesByLocation = new Map(state.pricesByLocation)
    const lastFetchAt = new Map(state.lastFetchAt)

    for (const [key, { typeId }] of state.trackedTypes) {
      if (typeIdSet.has(typeId)) {
        keysToDelete.push(key)
        trackedTypes.delete(key)
        lastFetchAt.delete(key)
      }
    }

    for (const typeId of typeIds) {
      pricesByType.delete(typeId)
      pricesByLocation.delete(typeId)
    }

    if (keysToDelete.length > 0) {
      set({ trackedTypes, pricesByType, pricesByLocation, lastFetchAt })

      try {
        await deleteTrackedFromDB(keysToDelete)
        await deletePricesFromDB(typeIds)
        logger.info('Untracked types from regional market', {
          module: 'RegionalMarketStore',
          types: typeIds.length,
        })
      } catch (err) {
        logger.error('Failed to delete untracked types from DB', err instanceof Error ? err : undefined, {
          module: 'RegionalMarketStore',
        })
      }
    }
  },

  registerStructures: (structureIds: number[], typeIds: number[], characterId: number) => {
    if (structureIds.length === 0 || typeIds.length === 0) return

    const state = get()
    const trackedStructures = new Map(state.trackedStructures)
    const newStructures: TrackedStructureRecord[] = []
    let hasChanges = false

    for (const structureId of structureIds) {
      const existing = trackedStructures.get(structureId)
      if (existing) {
        let modified = false
        for (const typeId of typeIds) {
          if (!existing.typeIds.has(typeId)) {
            existing.typeIds.add(typeId)
            modified = true
          }
        }
        if (modified) {
          hasChanges = true
          newStructures.push({
            structureId,
            characterId: existing.characterId,
            typeIds: Array.from(existing.typeIds),
            lastFetchAt: existing.lastFetchAt,
          })
        }
      } else {
        const typeIdSet = new Set(typeIds)
        trackedStructures.set(structureId, { characterId, typeIds: typeIdSet, lastFetchAt: 0 })
        hasChanges = true
        newStructures.push({
          structureId,
          characterId,
          typeIds: Array.from(typeIdSet),
          lastFetchAt: 0,
        })
      }
    }

    if (hasChanges) {
      set({ trackedStructures })
      for (const record of newStructures) {
        saveStructureToDB(record).catch((err) => {
          logger.error('Failed to save tracked structure', err instanceof Error ? err : undefined, {
            module: 'RegionalMarketStore',
            structureId: record.structureId,
          })
        })
      }

      if (state.initialized && !state.isUpdating) {
        get().update()
      }
    }
  },

  untrackStructures: async (structureIds: number[]) => {
    if (structureIds.length === 0) return

    const state = get()
    const structureIdSet = new Set(structureIds)
    const trackedStructures = new Map(state.trackedStructures)
    const pricesByLocation = new Map(state.pricesByLocation)
    const pricesByType = new Map(state.pricesByType)
    const toDelete: number[] = []

    for (const structureId of structureIds) {
      if (trackedStructures.has(structureId)) {
        trackedStructures.delete(structureId)
        toDelete.push(structureId)
      }
    }

    for (const [typeId, locationMap] of pricesByLocation) {
      for (const structureId of structureIdSet) {
        locationMap.delete(structureId)
      }
      if (locationMap.size > 0) {
        pricesByType.set(typeId, Math.min(...locationMap.values()))
      } else {
        pricesByType.delete(typeId)
        pricesByLocation.delete(typeId)
      }
    }

    if (toDelete.length > 0) {
      set({ trackedStructures, pricesByLocation, pricesByType })

      try {
        await deleteStructuresFromDB(toDelete)
        logger.info('Untracked structures from regional market', {
          module: 'RegionalMarketStore',
          structures: toDelete.length,
        })
      } catch (err) {
        logger.error('Failed to delete untracked structures from DB', err instanceof Error ? err : undefined, {
          module: 'RegionalMarketStore',
        })
      }
    }
  },

  getPrice: (typeId: number) => {
    return get().pricesByType.get(typeId)
  },

  getPriceAtLocation: (typeId: number, locationId: number) => {
    const typeMap = get().pricesByLocation.get(typeId)
    return typeMap?.get(locationId)
  },

  clear: async () => {
    await clearDB()
    useExpiryCacheStore.getState().clearForOwner(OWNER_KEY)
    set({
      pricesByType: new Map(),
      pricesByLocation: new Map(),
      lastFetchAt: new Map(),
      trackedTypes: new Map(),
      trackedStructures: new Map(),
      updateError: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async () => {
  await useRegionalMarketStore.getState().update()
})
