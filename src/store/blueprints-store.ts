import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esiClient, type ESIResponseMeta } from '@/api/esi-client'
import { ESIBlueprintSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIBlueprint = z.infer<typeof ESIBlueprintSchema>

const DB_NAME = 'ecteveassets-blueprints'
const DB_VERSION = 1
const STORE_BLUEPRINTS = 'blueprints'
const STORE_META = 'meta'

export interface OwnerBlueprints {
  owner: Owner
  blueprints: ESIBlueprint[]
}

interface StoredOwnerBlueprints {
  ownerKey: string
  owner: Owner
  blueprints: ESIBlueprint[]
}

export interface BlueprintInfo {
  materialEfficiency: number
  timeEfficiency: number
  runs: number
  isCopy: boolean
}

interface BlueprintsState {
  blueprintsByOwner: OwnerBlueprints[]
  blueprintsByItemId: Map<number, BlueprintInfo>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface BlueprintsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
}

type BlueprintsStore = BlueprintsState & BlueprintsActions

let db: IDBDatabase | null = null

function getBlueprintsEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/blueprints/`
  }
  return `/characters/${owner.id}/blueprints/`
}

async function fetchOwnerBlueprintsWithMeta(owner: Owner): Promise<ESIResponseMeta<ESIBlueprint[]>> {
  const endpoint = getBlueprintsEndpoint(owner)
  return esiClient.fetchWithPaginationMeta<ESIBlueprint>(endpoint, {
    characterId: owner.characterId,
    schema: ESIBlueprintSchema,
  })
}

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open blueprints DB', request.error, { module: 'BlueprintsStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_BLUEPRINTS)) {
        database.createObjectStore(STORE_BLUEPRINTS, { keyPath: 'ownerKey' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

function buildBlueprintMap(blueprintsByOwner: OwnerBlueprints[]): Map<number, BlueprintInfo> {
  const map = new Map<number, BlueprintInfo>()
  for (const { blueprints } of blueprintsByOwner) {
    for (const bp of blueprints) {
      map.set(bp.item_id, {
        materialEfficiency: bp.material_efficiency,
        timeEfficiency: bp.time_efficiency,
        runs: bp.runs,
        isCopy: bp.quantity === -2,
      })
    }
  }
  return map
}

async function loadFromDB(): Promise<{ blueprintsByOwner: OwnerBlueprints[] }> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_BLUEPRINTS], 'readonly')
    const bpStore = tx.objectStore(STORE_BLUEPRINTS)

    const blueprintsByOwner: OwnerBlueprints[] = []
    const bpRequest = bpStore.getAll()

    tx.oncomplete = () => {
      for (const stored of bpRequest.result as StoredOwnerBlueprints[]) {
        blueprintsByOwner.push({ owner: stored.owner, blueprints: stored.blueprints })
      }
      resolve({ blueprintsByOwner })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(blueprintsByOwner: OwnerBlueprints[]): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_BLUEPRINTS], 'readwrite')
    const bpStore = tx.objectStore(STORE_BLUEPRINTS)

    bpStore.clear()
    for (const { owner, blueprints } of blueprintsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      bpStore.put({ ownerKey, owner, blueprints } as StoredOwnerBlueprints)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_BLUEPRINTS, STORE_META], 'readwrite')
    tx.objectStore(STORE_BLUEPRINTS).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useBlueprintsStore = create<BlueprintsStore>((set, get) => ({
  blueprintsByOwner: [],
  blueprintsByItemId: new Map(),
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { blueprintsByOwner } = await loadFromDB()
      const blueprintsByItemId = buildBlueprintMap(blueprintsByOwner)
      set({ blueprintsByOwner, blueprintsByItemId, initialized: true })
      logger.info('Blueprints store initialized', {
        module: 'BlueprintsStore',
        owners: blueprintsByOwner.length,
        blueprints: blueprintsByItemId.size,
      })
    } catch (err) {
      logger.error('Failed to load blueprints from DB', err instanceof Error ? err : undefined, {
        module: 'BlueprintsStore',
      })
      set({ initialized: true })
    }
  },

  canUpdate: () => {
    const { isUpdating, blueprintsByOwner } = get()
    if (isUpdating) return false

    const expiryCacheStore = useExpiryCacheStore.getState()

    for (const { owner } of blueprintsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getBlueprintsEndpoint(owner)
      if (expiryCacheStore.isExpired(ownerKey, endpoint)) {
        return true
      }
    }

    const owners = Object.values(useAuthStore.getState().owners)
    for (const owner of owners) {
      if (!owner) continue
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getBlueprintsEndpoint(owner)
      if (expiryCacheStore.isExpired(ownerKey, endpoint)) {
        return true
      }
    }

    return false
  },

  getTimeUntilUpdate: () => {
    const { blueprintsByOwner } = get()
    const expiryCacheStore = useExpiryCacheStore.getState()

    let minTime = Infinity
    for (const { owner } of blueprintsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getBlueprintsEndpoint(owner)
      const time = expiryCacheStore.getTimeUntilExpiry(ownerKey, endpoint)
      if (time < minTime) minTime = time
    }

    return minTime === Infinity ? 0 : minTime
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? owners.filter((o): o is Owner => o !== undefined)
      : owners.filter((owner): owner is Owner => {
          if (!owner) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getBlueprintsEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need blueprints update', { module: 'BlueprintsStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingBlueprints = new Map(
        state.blueprintsByOwner.map((ob) => [`${ob.owner.type}-${ob.owner.id}`, ob])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getBlueprintsEndpoint(owner)

        try {
          logger.info('Fetching blueprints', { module: 'BlueprintsStore', owner: owner.name })
          const { data: blueprints, expiresAt, etag } = await fetchOwnerBlueprintsWithMeta(owner)

          existingBlueprints.set(ownerKey, { owner, blueprints })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)
        } catch (err) {
          logger.error('Failed to fetch blueprints', err instanceof Error ? err : undefined, {
            module: 'BlueprintsStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingBlueprints.values())
      await saveToDB(results)

      const blueprintsByItemId = buildBlueprintMap(results)

      set({
        blueprintsByOwner: results,
        blueprintsByItemId,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any blueprints' : null,
      })

      logger.info('Blueprints updated', {
        module: 'BlueprintsStore',
        owners: ownersToUpdate.length,
        totalBlueprints: blueprintsByItemId.size,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Blueprints update failed', err instanceof Error ? err : undefined, {
        module: 'BlueprintsStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getBlueprintsEndpoint(owner)

      logger.info('Fetching blueprints for owner', { module: 'BlueprintsStore', owner: owner.name })
      const { data: blueprints, expiresAt, etag } = await fetchOwnerBlueprintsWithMeta(owner)

      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)

      const updated = state.blueprintsByOwner.filter(
        (ob) => `${ob.owner.type}-${ob.owner.id}` !== ownerKey
      )
      updated.push({ owner, blueprints })

      await saveToDB(updated)

      const blueprintsByItemId = buildBlueprintMap(updated)

      set({ blueprintsByOwner: updated, blueprintsByItemId })

      logger.info('Blueprints updated for owner', {
        module: 'BlueprintsStore',
        owner: owner.name,
        blueprints: blueprints.length,
      })
    } catch (err) {
      logger.error('Failed to fetch blueprints for owner', err instanceof Error ? err : undefined, {
        module: 'BlueprintsStore',
        owner: owner.name,
      })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.blueprintsByOwner.filter(
      (ob) => `${ob.owner.type}-${ob.owner.id}` !== ownerKey
    )

    if (updated.length === state.blueprintsByOwner.length) return

    await saveToDB(updated)
    const blueprintsByItemId = buildBlueprintMap(updated)
    set({ blueprintsByOwner: updated, blueprintsByItemId })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Blueprints removed for owner', { module: 'BlueprintsStore', ownerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      blueprintsByOwner: [],
      blueprintsByItemId: new Map(),
      updateError: null,
    })
  },
}))

export function getBlueprintInfo(itemId: number): BlueprintInfo | undefined {
  return useBlueprintsStore.getState().blueprintsByItemId.get(itemId)
}

export function formatBlueprintName(baseName: string, itemId: number): string {
  const info = getBlueprintInfo(itemId)
  if (!info) return baseName

  if (info.isCopy) {
    return `${baseName} (ME${info.materialEfficiency} TE${info.timeEfficiency} R${info.runs})`
  }
  return `${baseName} (ME${info.materialEfficiency} TE${info.timeEfficiency})`
}
