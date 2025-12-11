import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esiClient, type ESIResponseMeta } from '@/api/esi-client'
import { ESICloneSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIClone = z.infer<typeof ESICloneSchema>

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
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface ClonesActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
}

type ClonesStore = ClonesState & ClonesActions

let db: IDBDatabase | null = null

function getClonesEndpoint(owner: Owner): string {
  return `/characters/${owner.characterId}/clones/`
}

async function fetchClonesWithMeta(owner: Owner): Promise<ESIResponseMeta<ESIClone>> {
  const endpoint = getClonesEndpoint(owner)
  return esiClient.fetchWithMeta<ESIClone>(endpoint, {
    characterId: owner.characterId,
    schema: ESICloneSchema,
  })
}

async function fetchImplantsWithMeta(owner: Owner): Promise<ESIResponseMeta<number[]>> {
  return esiClient.fetchWithMeta<number[]>(`/characters/${owner.characterId}/implants/`, {
    characterId: owner.characterId,
    schema: z.array(z.number()),
  })
}

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

async function loadFromDB(): Promise<{ clonesByOwner: CharacterCloneData[] }> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CLONES], 'readonly')
    const clonesStore = tx.objectStore(STORE_CLONES)

    const clonesByOwner: CharacterCloneData[] = []
    const clonesRequest = clonesStore.getAll()

    tx.oncomplete = () => {
      for (const stored of clonesRequest.result as StoredCharacterCloneData[]) {
        clonesByOwner.push({
          owner: stored.owner,
          clones: stored.clones,
          activeImplants: stored.activeImplants,
        })
      }
      resolve({ clonesByOwner })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(clonesByOwner: CharacterCloneData[]): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CLONES], 'readwrite')
    const clonesStore = tx.objectStore(STORE_CLONES)

    clonesStore.clear()
    for (const { owner, clones, activeImplants } of clonesByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      clonesStore.put({ ownerKey, owner, clones, activeImplants } as StoredCharacterCloneData)
    }

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
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { clonesByOwner } = await loadFromDB()
      set({ clonesByOwner, initialized: true })
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
    const { isUpdating, clonesByOwner } = get()
    if (isUpdating) return false

    const expiryCacheStore = useExpiryCacheStore.getState()

    for (const { owner } of clonesByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getClonesEndpoint(owner)
      if (expiryCacheStore.isExpired(ownerKey, endpoint)) {
        return true
      }
    }

    const owners = Object.values(useAuthStore.getState().owners).filter((o) => o.type === 'character')
    for (const owner of owners) {
      if (!owner) continue
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getClonesEndpoint(owner)
      if (expiryCacheStore.isExpired(ownerKey, endpoint)) {
        return true
      }
    }

    return false
  },

  getTimeUntilUpdate: () => {
    const { clonesByOwner } = get()
    const expiryCacheStore = useExpiryCacheStore.getState()

    let minTime = Infinity
    for (const { owner } of clonesByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getClonesEndpoint(owner)
      const time = expiryCacheStore.getTimeUntilExpiry(ownerKey, endpoint)
      if (time < minTime) minTime = time
    }

    return minTime === Infinity ? 0 : minTime
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const allOwners = Object.values(useAuthStore.getState().owners).filter(
      (o) => o.type === 'character'
    )
    if (allOwners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? allOwners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : allOwners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getClonesEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need clones update', { module: 'ClonesStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingClones = new Map(
        state.clonesByOwner.map((oc) => [`${oc.owner.type}-${oc.owner.id}`, oc])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getClonesEndpoint(owner)

        try {
          logger.info('Fetching clones', { module: 'ClonesStore', owner: owner.name })
          const [clonesResult, implantsResult] = await Promise.all([
            fetchClonesWithMeta(owner),
            fetchImplantsWithMeta(owner),
          ])

          existingClones.set(ownerKey, {
            owner,
            clones: clonesResult.data,
            activeImplants: implantsResult.data,
          })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, clonesResult.expiresAt, clonesResult.etag)
        } catch (err) {
          logger.error('Failed to fetch clones', err instanceof Error ? err : undefined, {
            module: 'ClonesStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingClones.values())
      await saveToDB(results)

      set({
        clonesByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any clones' : null,
      })

      logger.info('Clones updated', {
        module: 'ClonesStore',
        owners: ownersToUpdate.length,
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
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getClonesEndpoint(owner)

      logger.info('Fetching clones for owner', { module: 'ClonesStore', owner: owner.name })

      const [clonesResult, implantsResult] = await Promise.all([
        fetchClonesWithMeta(owner),
        fetchImplantsWithMeta(owner),
      ])

      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, clonesResult.expiresAt, clonesResult.etag)

      const updated = state.clonesByOwner.filter(
        (oc) => `${oc.owner.type}-${oc.owner.id}` !== ownerKey
      )
      updated.push({ owner, clones: clonesResult.data, activeImplants: implantsResult.data })

      await saveToDB(updated)

      set({ clonesByOwner: updated })

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

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.clonesByOwner.filter(
      (oc) => `${oc.owner.type}-${oc.owner.id}` !== ownerKey
    )

    if (updated.length === state.clonesByOwner.length) return

    await saveToDB(updated)
    set({ clonesByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Clones removed for owner', { module: 'ClonesStore', ownerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      clonesByOwner: [],
      updateError: null,
    })
  },
}))
