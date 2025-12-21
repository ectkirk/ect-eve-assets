import { create } from 'zustand'
import type { Owner } from './auth-store'
import {
  getCorporationDivisions,
  type ESICorporationDivisions,
} from '@/api/endpoints/corporation'
import { logger } from '@/lib/logger'
import { useStoreRegistry } from './store-registry'
import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbDelete,
  idbClear,
} from '@/lib/idb-utils'

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
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type DivisionsStore = DivisionsState & DivisionsActions

const DB_CONFIG = {
  dbName: 'ecteveassets-divisions',
  version: 1,
  stores: [{ name: 'divisions', keyPath: 'corporationId' }],
  module: 'DivisionsStore',
}

async function getDB() {
  return openDatabase(DB_CONFIG)
}

export const useDivisionsStore = create<DivisionsStore>((set, get) => ({
  divisionsByCorp: new Map(),
  isLoading: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const db = await getDB()
      const items = await idbGetAll<CorporationDivisions>(db, 'divisions')
      const divisionsByCorp = new Map<number, CorporationDivisions>()
      for (const item of items) {
        divisionsByCorp.set(item.corporationId, item)
      }
      set({ divisionsByCorp, initialized: true })
      logger.info('Divisions store initialized', {
        module: 'DivisionsStore',
        corps: divisionsByCorp.size,
      })
    } catch (err) {
      logger.error(
        'Failed to load divisions from DB',
        err instanceof Error ? err : undefined,
        { module: 'DivisionsStore' }
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

      const db = await getDB()
      await idbPut(db, 'divisions', divisions)

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

  removeForOwner: async (ownerType: string, ownerId: number) => {
    if (ownerType !== 'corporation') return
    const state = get()
    if (!state.divisionsByCorp.has(ownerId)) return

    const db = await getDB()
    await idbDelete(db, 'divisions', ownerId)
    const updated = new Map(state.divisionsByCorp)
    updated.delete(ownerId)
    set({ divisionsByCorp: updated })
  },

  clear: async () => {
    const db = await getDB()
    await idbClear(db, 'divisions')
    set({ divisionsByCorp: new Map() })
  },
}))

useStoreRegistry.getState().register({
  name: 'divisions',
  removeForOwner: useDivisionsStore.getState().removeForOwner,
  clear: useDivisionsStore.getState().clear,
  getIsUpdating: () => useDivisionsStore.getState().isLoading,
  init: useDivisionsStore.getState().init,
})

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
