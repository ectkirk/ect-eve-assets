import { create } from 'zustand'
import { getStarbaseDetail, type ESIStarbaseDetail } from '@/api/endpoints/starbases'
import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-starbase-details'
const DB_VERSION = 1
const STORE_NAME = 'details'

interface StarbaseDetailKey {
  corporationId: number
  starbaseId: number
  systemId: number
  characterId: number
}

interface StoredDetail {
  starbaseId: number
  detail: ESIStarbaseDetail
  fetchedAt: number
}

interface StarbaseDetailsState {
  details: Map<number, ESIStarbaseDetail>
  loading: Set<number>
  failed: Set<number>
  initialized: boolean
}

interface StarbaseDetailsActions {
  init: () => Promise<void>
  fetchDetail: (key: StarbaseDetailKey) => Promise<ESIStarbaseDetail | null>
  getDetail: (starbaseId: number) => ESIStarbaseDetail | undefined
  clear: () => Promise<void>
}

type StarbaseDetailsStore = StarbaseDetailsState & StarbaseDetailsActions

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open starbase details DB', request.error, { module: 'StarbaseDetailsStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'starbaseId' })
      }
    }
  })
}

async function loadAllFromDB(): Promise<Map<number, ESIStarbaseDetail>> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME], 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    tx.oncomplete = () => {
      const details = new Map<number, ESIStarbaseDetail>()
      for (const stored of request.result as StoredDetail[]) {
        details.set(stored.starbaseId, stored.detail)
      }
      resolve(details)
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(starbaseId: number, detail: ESIStarbaseDetail): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME], 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ starbaseId, detail, fetchedAt: Date.now() } as StoredDetail)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME], 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useStarbaseDetailsStore = create<StarbaseDetailsStore>((set, get) => ({
  details: new Map(),
  loading: new Set(),
  failed: new Set(),
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const details = await loadAllFromDB()
      set({ details, initialized: true })
      logger.info('Starbase details loaded from cache', {
        module: 'StarbaseDetailsStore',
        count: details.size,
      })
    } catch (err) {
      logger.error('Failed to load starbase details from cache', err instanceof Error ? err : undefined, {
        module: 'StarbaseDetailsStore',
      })
      set({ initialized: true })
    }
  },

  fetchDetail: async ({ corporationId, starbaseId, systemId, characterId }) => {
    const state = get()
    if (state.details.has(starbaseId) || state.loading.has(starbaseId)) {
      return state.details.get(starbaseId) ?? null
    }

    set((s) => ({ loading: new Set(s.loading).add(starbaseId) }))

    try {
      const detail = await getStarbaseDetail(characterId, corporationId, starbaseId, systemId)
      set((s) => {
        const newDetails = new Map(s.details)
        newDetails.set(starbaseId, detail)
        const newLoading = new Set(s.loading)
        newLoading.delete(starbaseId)
        return { details: newDetails, loading: newLoading }
      })

      saveToDB(starbaseId, detail).catch((err) => {
        logger.error('Failed to save starbase detail to cache', err instanceof Error ? err : undefined, {
          module: 'StarbaseDetailsStore',
          starbaseId,
        })
      })

      return detail
    } catch (err) {
      logger.error('Failed to fetch starbase detail', err instanceof Error ? err : undefined, {
        module: 'StarbaseDetailsStore',
        starbaseId,
      })
      set((s) => {
        const newLoading = new Set(s.loading)
        newLoading.delete(starbaseId)
        const newFailed = new Set(s.failed)
        newFailed.add(starbaseId)
        return { loading: newLoading, failed: newFailed }
      })
      return null
    }
  },

  getDetail: (starbaseId) => get().details.get(starbaseId),

  clear: async () => {
    set({ details: new Map(), loading: new Set(), failed: new Set() })
    try {
      await clearDB()
      logger.info('Starbase details cache cleared', { module: 'StarbaseDetailsStore' })
    } catch (err) {
      logger.error('Failed to clear starbase details cache', err instanceof Error ? err : undefined, {
        module: 'StarbaseDetailsStore',
      })
    }
  },
}))

const FUEL_BLOCK_TYPE_IDS = new Set([4051, 4246, 4247, 4312])
const STRONTIUM_TYPE_ID = 16275

export function calculateFuelHours(
  detail: ESIStarbaseDetail | undefined,
  towerSize: number | undefined,
  fuelTier: number | undefined
): number | null {
  if (!detail?.fuels || towerSize === undefined) return null

  const fuelBlocks = detail.fuels.find((f) => FUEL_BLOCK_TYPE_IDS.has(f.type_id))
  if (!fuelBlocks) return null

  const baseRate = towerSize * 10
  const discount = (fuelTier ?? 0) * 0.1
  const effectiveRate = baseRate * (1 - discount)

  if (effectiveRate <= 0) return null

  return fuelBlocks.quantity / effectiveRate
}

export function calculateStrontHours(
  detail: ESIStarbaseDetail | undefined,
  towerSize: number | undefined
): number | null {
  if (!detail?.fuels || towerSize === undefined) return null

  const stront = detail.fuels.find((f) => f.type_id === STRONTIUM_TYPE_ID)
  if (!stront) return null

  const rate = towerSize * 100
  return stront.quantity / rate
}
