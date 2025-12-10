import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { getCharacterClones, getCharacterImplants, type ESIClone } from '@/api/endpoints/clones'
import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-clones'
const DB_VERSION = 1
const STORE_CLONES = 'clones'
const STORE_META = 'meta'

export interface CharacterCloneData {
  owner: Owner
  clones: ESIClone
  activeImplants: number[]
}

interface StoredCharacterCloneData {
  ownerKey: string
  owner: Owner
  clones: ESIClone
  activeImplants: number[]
}

interface ClonesState {
  clonesByOwner: CharacterCloneData[]
  lastUpdated: number | null
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

const UPDATE_COOLDOWN_MS = 5 * 60 * 1000

interface ClonesActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
}

type ClonesStore = ClonesState & ClonesActions

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open clones DB', request.error, { module: 'ClonesStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_CLONES)) {
        database.createObjectStore(STORE_CLONES, { keyPath: 'ownerKey' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<{
  clonesByOwner: CharacterCloneData[]
  lastUpdated: number | null
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CLONES, STORE_META], 'readonly')
    const clonesStore = tx.objectStore(STORE_CLONES)
    const metaStore = tx.objectStore(STORE_META)

    const clonesByOwner: CharacterCloneData[] = []
    const clonesRequest = clonesStore.getAll()
    const metaRequest = metaStore.getAll()

    tx.oncomplete = () => {
      for (const stored of clonesRequest.result as StoredCharacterCloneData[]) {
        clonesByOwner.push({
          owner: stored.owner,
          clones: stored.clones,
          activeImplants: stored.activeImplants,
        })
      }

      let lastUpdated: number | null = null
      for (const meta of metaRequest.result) {
        if (meta.key === 'lastUpdated') lastUpdated = meta.value
      }

      resolve({ clonesByOwner, lastUpdated })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(clonesByOwner: CharacterCloneData[], lastUpdated: number): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CLONES, STORE_META], 'readwrite')
    const clonesStore = tx.objectStore(STORE_CLONES)
    const metaStore = tx.objectStore(STORE_META)

    clonesStore.clear()
    for (const { owner, clones, activeImplants } of clonesByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      clonesStore.put({ ownerKey, owner, clones, activeImplants } as StoredCharacterCloneData)
    }

    metaStore.put({ key: 'lastUpdated', value: lastUpdated })

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CLONES, STORE_META], 'readwrite')
    tx.objectStore(STORE_CLONES).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useClonesStore = create<ClonesStore>((set, get) => ({
  clonesByOwner: [],
  lastUpdated: null,
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { clonesByOwner, lastUpdated } = await loadFromDB()
      set({ clonesByOwner, lastUpdated, initialized: true })
      logger.info('Clones store initialized', {
        module: 'ClonesStore',
        owners: clonesByOwner.length,
      })
    } catch (err) {
      logger.error('Failed to load clones from DB', err instanceof Error ? err : undefined, {
        module: 'ClonesStore',
      })
      set({ initialized: true })
    }
  },

  canUpdate: () => {
    const { lastUpdated, isUpdating } = get()
    if (isUpdating) return false
    if (!lastUpdated) return true
    return Date.now() - lastUpdated >= UPDATE_COOLDOWN_MS
  },

  getTimeUntilUpdate: () => {
    const { lastUpdated } = get()
    if (!lastUpdated) return 0
    const elapsed = Date.now() - lastUpdated
    const remaining = UPDATE_COOLDOWN_MS - elapsed
    return remaining > 0 ? remaining : 0
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    if (!force && state.lastUpdated && Date.now() - state.lastUpdated < UPDATE_COOLDOWN_MS) {
      const minutes = Math.ceil((UPDATE_COOLDOWN_MS - (Date.now() - state.lastUpdated)) / 60000)
      set({ updateError: `Update available in ${minutes} minute${minutes === 1 ? '' : 's'}` })
      return
    }

    const owners = Object.values(useAuthStore.getState().owners).filter(
      (o) => o.type === 'character'
    )
    if (owners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const results: CharacterCloneData[] = []

      for (const owner of owners) {
        try {
          logger.info('Fetching clones', { module: 'ClonesStore', owner: owner.name })
          const [clones, activeImplants] = await Promise.all([
            getCharacterClones(owner.characterId),
            getCharacterImplants(owner.characterId),
          ])
          results.push({ owner, clones, activeImplants })
        } catch (err) {
          logger.error('Failed to fetch clones', err instanceof Error ? err : undefined, {
            module: 'ClonesStore',
            owner: owner.name,
          })
        }
      }

      const lastUpdated = Date.now()
      await saveToDB(results, lastUpdated)

      set({
        clonesByOwner: results,
        lastUpdated,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any clones' : null,
      })

      logger.info('Clones updated', {
        module: 'ClonesStore',
        owners: results.length,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Clones update failed', err instanceof Error ? err : undefined, {
        module: 'ClonesStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    if (owner.type !== 'character') return

    const state = get()
    try {
      logger.info('Fetching clones for new owner', { module: 'ClonesStore', owner: owner.name })

      const [clones, activeImplants] = await Promise.all([
        getCharacterClones(owner.characterId),
        getCharacterImplants(owner.characterId),
      ])

      const ownerKey = `${owner.type}-${owner.id}`
      const updated = state.clonesByOwner.filter(
        (oc) => `${oc.owner.type}-${oc.owner.id}` !== ownerKey
      )
      updated.push({ owner, clones, activeImplants })

      const lastUpdated = Date.now()
      await saveToDB(updated, lastUpdated)

      set({ clonesByOwner: updated, lastUpdated })

      logger.info('Clones updated for owner', {
        module: 'ClonesStore',
        owner: owner.name,
      })
    } catch (err) {
      logger.error('Failed to fetch clones for owner', err instanceof Error ? err : undefined, {
        module: 'ClonesStore',
        owner: owner.name,
      })
    }
  },

  clear: async () => {
    await clearDB()
    set({
      clonesByOwner: [],
      lastUpdated: null,
      updateError: null,
    })
  },
}))
