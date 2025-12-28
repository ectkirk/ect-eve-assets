import { create } from 'zustand'
import {
  getStarbaseDetail,
  type ESIStarbaseDetail,
} from '@/api/endpoints/starbases'
import {
  FUEL_BLOCK_TYPE_IDS,
  STRONTIUM_TYPE_ID,
} from '@/lib/structure-constants'
import { useStoreRegistry } from './store-registry'
import { logger } from '@/lib/logger'
import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbDelete,
  idbClear,
  idbGetKeysByIndex,
  idbDeleteBatch,
} from '@/lib/idb-utils'

const STORE_NAME = 'details'
const STALE_THRESHOLD_MS = 5 * 60 * 1000

interface StarbaseDetailKey {
  corporationId: number
  starbaseId: number
  systemId: number
  characterId: number
}

interface StoredDetail {
  starbaseId: number
  corporationId: number
  detail: ESIStarbaseDetail
  fetchedAt: number
}

interface StarbaseDetailsState {
  details: Map<number, ESIStarbaseDetail>
  corporationById: Map<number, number>
  fetchedAt: Map<number, number>
  loading: Set<number>
  failed: Set<number>
  initialized: boolean
}

interface StarbaseDetailsActions {
  init: () => Promise<void>
  fetchDetail: (
    key: StarbaseDetailKey,
    force?: boolean
  ) => Promise<ESIStarbaseDetail | null>
  getDetail: (starbaseId: number) => ESIStarbaseDetail | undefined
  removeOrphans: (validStarbaseIds: Set<number>) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type StarbaseDetailsStore = StarbaseDetailsState & StarbaseDetailsActions

async function getDB() {
  return openDatabase(DB.STARBASE_DETAILS, {
    onUpgrade: (db, oldVersion) => {
      if (oldVersion > 0 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME)
      }
    },
  })
}

interface LoadedDetails {
  details: Map<number, ESIStarbaseDetail>
  corporationById: Map<number, number>
  fetchedAt: Map<number, number>
}

async function loadAllFromDB(): Promise<LoadedDetails> {
  const db = await getDB()
  const records = await idbGetAll<StoredDetail>(db, STORE_NAME)
  const details = new Map<number, ESIStarbaseDetail>()
  const corporationById = new Map<number, number>()
  const fetchedAt = new Map<number, number>()
  for (const stored of records) {
    details.set(stored.starbaseId, stored.detail)
    corporationById.set(stored.starbaseId, stored.corporationId)
    fetchedAt.set(stored.starbaseId, stored.fetchedAt)
  }
  return { details, corporationById, fetchedAt }
}

async function saveToDB(
  starbaseId: number,
  corporationId: number,
  detail: ESIStarbaseDetail
): Promise<void> {
  const db = await getDB()
  await idbPut(db, STORE_NAME, {
    starbaseId,
    corporationId,
    detail,
    fetchedAt: Date.now(),
  } as StoredDetail)
}

async function deleteFromDB(starbaseId: number): Promise<void> {
  const db = await getDB()
  await idbDelete(db, STORE_NAME, starbaseId)
}

async function deleteByCorpFromDB(corporationId: number): Promise<number[]> {
  const db = await getDB()
  const keys = (await idbGetKeysByIndex(
    db,
    STORE_NAME,
    'corporationId',
    corporationId
  )) as number[]
  await idbDeleteBatch(db, STORE_NAME, keys)
  return keys
}

async function clearStarbaseDB(): Promise<void> {
  const db = await getDB()
  await idbClear(db, STORE_NAME)
}

let initPromise: Promise<void> | null = null

export const useStarbaseDetailsStore = create<StarbaseDetailsStore>(
  (set, get) => ({
    details: new Map(),
    corporationById: new Map(),
    fetchedAt: new Map(),
    loading: new Set(),
    failed: new Set(),
    initialized: false,

    init: async () => {
      if (get().initialized) return
      if (initPromise) return initPromise

      initPromise = (async () => {
        try {
          const { details, corporationById, fetchedAt } = await loadAllFromDB()
          set({ details, corporationById, fetchedAt, initialized: true })
          logger.info('Starbase details loaded from cache', {
            module: 'StarbaseDetailsStore',
            count: details.size,
          })
        } catch (err) {
          logger.error(
            'Failed to load starbase details from cache',
            err instanceof Error ? err : undefined,
            {
              module: 'StarbaseDetailsStore',
            }
          )
          set({ initialized: true })
        }
      })()

      return initPromise
    },

    fetchDetail: async (
      { corporationId, starbaseId, systemId, characterId },
      force = false
    ) => {
      const state = get()

      if (state.loading.has(starbaseId)) {
        return state.details.get(starbaseId) ?? null
      }

      const cachedAt = state.fetchedAt.get(starbaseId)
      const isStale = !cachedAt || Date.now() - cachedAt > STALE_THRESHOLD_MS

      if (state.details.has(starbaseId) && !isStale && !force) {
        return state.details.get(starbaseId)!
      }

      set((s) => ({ loading: new Set(s.loading).add(starbaseId) }))

      try {
        const detail = await getStarbaseDetail(
          characterId,
          corporationId,
          starbaseId,
          systemId
        )
        const now = Date.now()
        set((s) => {
          const newDetails = new Map(s.details)
          newDetails.set(starbaseId, detail)
          const newCorporationById = new Map(s.corporationById)
          newCorporationById.set(starbaseId, corporationId)
          const newFetchedAt = new Map(s.fetchedAt)
          newFetchedAt.set(starbaseId, now)
          const newLoading = new Set(s.loading)
          newLoading.delete(starbaseId)
          return {
            details: newDetails,
            corporationById: newCorporationById,
            fetchedAt: newFetchedAt,
            loading: newLoading,
          }
        })

        saveToDB(starbaseId, corporationId, detail).catch((err) => {
          logger.error(
            'Failed to save starbase detail to cache',
            err instanceof Error ? err : undefined,
            {
              module: 'StarbaseDetailsStore',
              starbaseId,
            }
          )
        })

        return detail
      } catch (err) {
        logger.error(
          'Failed to fetch starbase detail',
          err instanceof Error ? err : undefined,
          {
            module: 'StarbaseDetailsStore',
            starbaseId,
          }
        )
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

    removeOrphans: async (validStarbaseIds) => {
      const state = get()
      const toRemove: number[] = []

      for (const starbaseId of state.details.keys()) {
        if (!validStarbaseIds.has(starbaseId)) {
          toRemove.push(starbaseId)
        }
      }

      if (toRemove.length === 0) return

      set((s) => {
        const newDetails = new Map(s.details)
        const newCorporationById = new Map(s.corporationById)
        const newFetchedAt = new Map(s.fetchedAt)
        const newFailed = new Set(s.failed)
        for (const id of toRemove) {
          newDetails.delete(id)
          newCorporationById.delete(id)
          newFetchedAt.delete(id)
          newFailed.delete(id)
        }
        return {
          details: newDetails,
          corporationById: newCorporationById,
          fetchedAt: newFetchedAt,
          failed: newFailed,
        }
      })

      for (const id of toRemove) {
        deleteFromDB(id).catch((err) => {
          logger.error(
            'Failed to delete orphan starbase detail',
            err instanceof Error ? err : undefined,
            {
              module: 'StarbaseDetailsStore',
              starbaseId: id,
            }
          )
        })
      }

      logger.info('Removed orphan starbase details', {
        module: 'StarbaseDetailsStore',
        count: toRemove.length,
      })
    },

    removeForOwner: async (ownerType, ownerId) => {
      if (ownerType !== 'corporation') return

      const state = get()
      const toRemove: number[] = []

      for (const [starbaseId, corpId] of state.corporationById) {
        if (corpId === ownerId) {
          toRemove.push(starbaseId)
        }
      }

      if (toRemove.length === 0) return

      set((s) => {
        const newDetails = new Map(s.details)
        const newCorporationById = new Map(s.corporationById)
        const newFetchedAt = new Map(s.fetchedAt)
        const newFailed = new Set(s.failed)
        for (const id of toRemove) {
          newDetails.delete(id)
          newCorporationById.delete(id)
          newFetchedAt.delete(id)
          newFailed.delete(id)
        }
        return {
          details: newDetails,
          corporationById: newCorporationById,
          fetchedAt: newFetchedAt,
          failed: newFailed,
        }
      })

      try {
        await deleteByCorpFromDB(ownerId)
        logger.info('Removed starbase details for corporation', {
          module: 'StarbaseDetailsStore',
          corporationId: ownerId,
          count: toRemove.length,
        })
      } catch (err) {
        logger.error(
          'Failed to delete starbase details from DB',
          err instanceof Error ? err : undefined,
          {
            module: 'StarbaseDetailsStore',
            corporationId: ownerId,
          }
        )
      }
    },

    clear: async () => {
      initPromise = null
      set({
        details: new Map(),
        corporationById: new Map(),
        fetchedAt: new Map(),
        loading: new Set(),
        failed: new Set(),
        initialized: false,
      })
      try {
        await clearStarbaseDB()
        logger.info('Starbase details cache cleared', {
          module: 'StarbaseDetailsStore',
        })
      } catch (err) {
        logger.error(
          'Failed to clear starbase details cache',
          err instanceof Error ? err : undefined,
          {
            module: 'StarbaseDetailsStore',
          }
        )
      }
    },
  })
)

useStoreRegistry.getState().register({
  name: 'starbase details',
  removeForOwner: useStarbaseDetailsStore.getState().removeForOwner,
  clear: useStarbaseDetailsStore.getState().clear,
  getIsUpdating: () => useStarbaseDetailsStore.getState().loading.size > 0,
  init: useStarbaseDetailsStore.getState().init,
})

export function calculateFuelHours(
  detail: ESIStarbaseDetail | undefined,
  towerSize: number | undefined,
  fuelTier: number | undefined
): number | null {
  if (!detail?.fuels || towerSize === undefined) return null

  const fuelBlocks = detail.fuels.find((f) =>
    FUEL_BLOCK_TYPE_IDS.has(f.type_id)
  )
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
