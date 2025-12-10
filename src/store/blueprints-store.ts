import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { getCharacterBlueprints, getCorporationBlueprints, type ESIBlueprint } from '@/api/endpoints/blueprints'
import { logger } from '@/lib/logger'

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
  lastUpdated: number | null
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

const UPDATE_COOLDOWN_MS = 60 * 60 * 1000

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

async function loadFromDB(): Promise<{
  blueprintsByOwner: OwnerBlueprints[]
  lastUpdated: number | null
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_BLUEPRINTS, STORE_META], 'readonly')
    const bpStore = tx.objectStore(STORE_BLUEPRINTS)
    const metaStore = tx.objectStore(STORE_META)

    const blueprintsByOwner: OwnerBlueprints[] = []
    const bpRequest = bpStore.getAll()
    const metaRequest = metaStore.getAll()

    tx.oncomplete = () => {
      for (const stored of bpRequest.result as StoredOwnerBlueprints[]) {
        blueprintsByOwner.push({ owner: stored.owner, blueprints: stored.blueprints })
      }

      let lastUpdated: number | null = null
      for (const meta of metaRequest.result) {
        if (meta.key === 'lastUpdated') lastUpdated = meta.value
      }

      resolve({ blueprintsByOwner, lastUpdated })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(blueprintsByOwner: OwnerBlueprints[], lastUpdated: number): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_BLUEPRINTS, STORE_META], 'readwrite')
    const bpStore = tx.objectStore(STORE_BLUEPRINTS)
    const metaStore = tx.objectStore(STORE_META)

    bpStore.clear()
    for (const { owner, blueprints } of blueprintsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      bpStore.put({ ownerKey, owner, blueprints } as StoredOwnerBlueprints)
    }

    metaStore.put({ key: 'lastUpdated', value: lastUpdated })

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

async function fetchOwnerBlueprints(owner: Owner): Promise<ESIBlueprint[]> {
  if (owner.type === 'corporation') {
    return getCorporationBlueprints(owner.id, owner.characterId)
  }
  return getCharacterBlueprints(owner.id, owner.characterId)
}

export const useBlueprintsStore = create<BlueprintsStore>((set, get) => ({
  blueprintsByOwner: [],
  blueprintsByItemId: new Map(),
  lastUpdated: null,
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { blueprintsByOwner, lastUpdated } = await loadFromDB()
      const blueprintsByItemId = buildBlueprintMap(blueprintsByOwner)
      set({ blueprintsByOwner, blueprintsByItemId, lastUpdated, initialized: true })
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

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const results: OwnerBlueprints[] = []

      for (const owner of owners) {
        try {
          logger.info('Fetching blueprints', { module: 'BlueprintsStore', owner: owner.name, type: owner.type })
          const blueprints = await fetchOwnerBlueprints(owner)
          results.push({ owner, blueprints })
        } catch (err) {
          logger.error('Failed to fetch blueprints', err instanceof Error ? err : undefined, {
            module: 'BlueprintsStore',
            owner: owner.name,
          })
        }
      }

      const lastUpdated = Date.now()
      await saveToDB(results, lastUpdated)

      const blueprintsByItemId = buildBlueprintMap(results)

      set({
        blueprintsByOwner: results,
        blueprintsByItemId,
        lastUpdated,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any blueprints' : null,
      })

      logger.info('Blueprints updated', {
        module: 'BlueprintsStore',
        owners: results.length,
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
      logger.info('Fetching blueprints for owner', { module: 'BlueprintsStore', owner: owner.name, type: owner.type })
      const blueprints = await fetchOwnerBlueprints(owner)

      const ownerKey = `${owner.type}-${owner.id}`
      const updated = state.blueprintsByOwner.filter(
        (ob) => `${ob.owner.type}-${ob.owner.id}` !== ownerKey
      )
      updated.push({ owner, blueprints })

      const lastUpdated = Date.now()
      await saveToDB(updated, lastUpdated)

      const blueprintsByItemId = buildBlueprintMap(updated)

      set({ blueprintsByOwner: updated, blueprintsByItemId, lastUpdated })

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

    await saveToDB(updated, state.lastUpdated ?? Date.now())
    const blueprintsByItemId = buildBlueprintMap(updated)
    set({ blueprintsByOwner: updated, blueprintsByItemId })

    logger.info('Blueprints removed for owner', { module: 'BlueprintsStore', ownerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      blueprintsByOwner: [],
      blueprintsByItemId: new Map(),
      lastUpdated: null,
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
    return `${baseName} (M${info.materialEfficiency} T${info.timeEfficiency} R${info.runs})`
  }
  return `${baseName} (M${info.materialEfficiency} T${info.timeEfficiency})`
}
