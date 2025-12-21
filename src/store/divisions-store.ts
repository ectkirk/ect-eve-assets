import { create } from 'zustand'
import type { Owner } from './auth-store'
import {
  getCorporationDivisions,
  type ESICorporationDivisions,
} from '@/api/endpoints/corporation'
import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-divisions'
const DB_VERSION = 1
const STORE_DIVISIONS = 'divisions'

export interface CorporationDivisions {
  corporationId: number
  hangar: { division: number; name?: string }[]
  wallet: { division: number; name?: string }[]
}

interface DivisionsState {
  divisionsByCorp: Map<number, CorporationDivisions>
  isLoading: boolean
  initialized: boolean
}

interface DivisionsActions {
  init: () => Promise<void>
  fetchForOwner: (owner: Owner) => Promise<void>
  getDivisions: (corporationId: number) => CorporationDivisions | undefined
  getHangarName: (corporationId: number, division: number) => string | undefined
  getWalletName: (corporationId: number, division: number) => string | undefined
  clear: () => Promise<void>
}

type DivisionsStore = DivisionsState & DivisionsActions

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open divisions DB', request.error, {
        module: 'DivisionsStore',
      })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_DIVISIONS)) {
        database.createObjectStore(STORE_DIVISIONS, {
          keyPath: 'corporationId',
        })
      }
    }
  })
}

async function loadFromDB(): Promise<Map<number, CorporationDivisions>> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_DIVISIONS], 'readonly')
    const store = tx.objectStore(STORE_DIVISIONS)
    const request = store.getAll()

    tx.oncomplete = () => {
      const map = new Map<number, CorporationDivisions>()
      for (const item of request.result as CorporationDivisions[]) {
        map.set(item.corporationId, item)
      }
      resolve(map)
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(divisions: CorporationDivisions): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_DIVISIONS], 'readwrite')
    const store = tx.objectStore(STORE_DIVISIONS)
    store.put(divisions)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_DIVISIONS], 'readwrite')
    tx.objectStore(STORE_DIVISIONS).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useDivisionsStore = create<DivisionsStore>((set, get) => ({
  divisionsByCorp: new Map(),
  isLoading: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const divisionsByCorp = await loadFromDB()
      set({ divisionsByCorp, initialized: true })
      logger.info('Divisions store initialized', {
        module: 'DivisionsStore',
        corps: divisionsByCorp.size,
      })
    } catch (err) {
      logger.error(
        'Failed to load divisions from DB',
        err instanceof Error ? err : undefined,
        {
          module: 'DivisionsStore',
        }
      )
      set({ initialized: true })
    }
  },

  fetchForOwner: async (owner: Owner) => {
    if (owner.type !== 'corporation') return

    const state = get()
    if (state.divisionsByCorp.has(owner.id)) return

    set({ isLoading: true })

    try {
      const response: ESICorporationDivisions = await getCorporationDivisions(
        owner.id,
        owner.characterId
      )

      const divisions: CorporationDivisions = {
        corporationId: owner.id,
        hangar: response.hangar ?? [],
        wallet: response.wallet ?? [],
      }

      await saveToDB(divisions)

      const updated = new Map(state.divisionsByCorp)
      updated.set(owner.id, divisions)
      set({ divisionsByCorp: updated, isLoading: false })

      logger.info('Fetched divisions', {
        module: 'DivisionsStore',
        corporationId: owner.id,
      })
    } catch (err) {
      logger.error(
        'Failed to fetch divisions',
        err instanceof Error ? err : undefined,
        {
          module: 'DivisionsStore',
          corporationId: owner.id,
        }
      )
      set({ isLoading: false })
    }
  },

  getDivisions: (corporationId: number) => {
    return get().divisionsByCorp.get(corporationId)
  },

  getHangarName: (corporationId: number, division: number) => {
    const divisions = get().divisionsByCorp.get(corporationId)
    if (!divisions) return undefined
    const hangar = divisions.hangar.find((h) => h.division === division)
    return hangar?.name
  },

  getWalletName: (corporationId: number, division: number) => {
    const divisions = get().divisionsByCorp.get(corporationId)
    if (!divisions) return undefined
    const wallet = divisions.wallet.find((w) => w.division === division)
    return wallet?.name
  },

  clear: async () => {
    await clearDB()
    set({ divisionsByCorp: new Map() })
  },
}))

export function useCorporationDivisions(owner: Owner | null) {
  const { divisionsByCorp, fetchForOwner, initialized, init } =
    useDivisionsStore()

  if (!initialized) {
    init()
  }

  if (
    owner?.type === 'corporation' &&
    initialized &&
    !divisionsByCorp.has(owner.id)
  ) {
    fetchForOwner(owner)
  }

  return owner?.type === 'corporation'
    ? divisionsByCorp.get(owner.id)
    : undefined
}
