import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { getCharacterAssets, getAssetNames, type ESIAsset, type ESIAssetName } from '@/api/endpoints/assets'
import { getCorporationAssets } from '@/api/endpoints/corporation'
import { fetchPrices } from '@/api/ref-client'
import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-assets'
const DB_VERSION = 1
const STORE_ASSETS = 'assets'
const STORE_META = 'meta'

export interface OwnerAssets {
  owner: Owner
  assets: ESIAsset[]
}

interface StoredOwnerAssets {
  ownerKey: string
  owner: Owner
  assets: ESIAsset[]
}

interface AssetState {
  assetsByOwner: OwnerAssets[]
  assetNames: Map<number, string>
  prices: Map<number, number>
  lastUpdated: number | null
  isUpdating: boolean
  updateError: string | null
  updateProgress: { current: number; total: number } | null
  initialized: boolean
}

const UPDATE_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

interface AssetActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
}

type AssetStore = AssetState & AssetActions

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open asset DB', request.error, { module: 'AssetStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      if (!database.objectStoreNames.contains(STORE_ASSETS)) {
        database.createObjectStore(STORE_ASSETS, { keyPath: 'ownerKey' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<{
  assetsByOwner: OwnerAssets[]
  assetNames: Map<number, string>
  prices: Map<number, number>
  lastUpdated: number | null
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ASSETS, STORE_META], 'readonly')
    const assetsStore = tx.objectStore(STORE_ASSETS)
    const metaStore = tx.objectStore(STORE_META)

    const assetsByOwner: OwnerAssets[] = []
    const assetsRequest = assetsStore.getAll()
    const metaRequest = metaStore.getAll()

    tx.oncomplete = () => {
      for (const stored of assetsRequest.result as StoredOwnerAssets[]) {
        assetsByOwner.push({ owner: stored.owner, assets: stored.assets })
      }

      let lastUpdated: number | null = null
      let assetNames = new Map<number, string>()
      let prices = new Map<number, number>()

      for (const meta of metaRequest.result) {
        if (meta.key === 'lastUpdated') lastUpdated = meta.value
        if (meta.key === 'assetNames') assetNames = new Map(meta.value)
        if (meta.key === 'prices') prices = new Map(meta.value)
      }

      resolve({ assetsByOwner, assetNames, prices, lastUpdated })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(
  assetsByOwner: OwnerAssets[],
  assetNames: Map<number, string>,
  prices: Map<number, number>,
  lastUpdated: number
): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ASSETS, STORE_META], 'readwrite')
    const assetsStore = tx.objectStore(STORE_ASSETS)
    const metaStore = tx.objectStore(STORE_META)

    assetsStore.clear()
    for (const { owner, assets } of assetsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      assetsStore.put({ ownerKey, owner, assets } as StoredOwnerAssets)
    }

    metaStore.put({ key: 'lastUpdated', value: lastUpdated })
    metaStore.put({ key: 'assetNames', value: Array.from(assetNames.entries()) })
    metaStore.put({ key: 'prices', value: Array.from(prices.entries()) })

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ASSETS, STORE_META], 'readwrite')
    tx.objectStore(STORE_ASSETS).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function fetchOwnerAssets(owner: Owner): Promise<ESIAsset[]> {
  if (owner.type === 'corporation') {
    return getCorporationAssets(owner.id, owner.characterId)
  }
  return getCharacterAssets(owner.id, owner.characterId)
}

async function fetchOwnerAssetNames(owner: Owner, assets: ESIAsset[]): Promise<ESIAssetName[]> {
  if (owner.type !== 'character') return []
  const singletonIds = assets.filter((a) => a.is_singleton).map((a) => a.item_id)
  if (singletonIds.length === 0) return []
  return getAssetNames(owner.id, owner.characterId, singletonIds)
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assetsByOwner: [],
  assetNames: new Map(),
  prices: new Map(),
  lastUpdated: null,
  isUpdating: false,
  updateError: null,
  updateProgress: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { assetsByOwner, assetNames, prices, lastUpdated } = await loadFromDB()
      set({ assetsByOwner, assetNames, prices, lastUpdated, initialized: true })
      logger.info('Asset store initialized from DB', {
        module: 'AssetStore',
        owners: assetsByOwner.length,
        assets: assetsByOwner.reduce((sum, o) => sum + o.assets.length, 0),
      })
    } catch (err) {
      logger.error('Failed to load assets from DB', err instanceof Error ? err : undefined, { module: 'AssetStore' })
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

    set({ isUpdating: true, updateError: null, updateProgress: { current: 0, total: owners.length } })

    try {
      const results: OwnerAssets[] = []
      const allNames = new Map<number, string>()

      for (let i = 0; i < owners.length; i++) {
        const owner = owners[i]
        if (!owner) continue
        set({ updateProgress: { current: i, total: owners.length } })

        try {
          logger.info('Fetching assets', { module: 'AssetStore', owner: owner.name, type: owner.type })
          const assets = await fetchOwnerAssets(owner)
          results.push({ owner, assets })

          const names = await fetchOwnerAssetNames(owner, assets)
          for (const n of names) {
            if (n.name && n.name !== 'None') {
              allNames.set(n.item_id, n.name)
            }
          }
        } catch (err) {
          logger.error('Failed to fetch assets for owner', err instanceof Error ? err : undefined, {
            module: 'AssetStore',
            owner: owner.name,
          })
        }
      }

      const lastUpdated = Date.now()

      // Fetch prices
      const typeIds = new Set<number>()
      for (const { assets } of results) {
        for (const asset of assets) {
          typeIds.add(asset.type_id)
        }
      }

      let prices = new Map<number, number>()
      if (typeIds.size > 0) {
        try {
          prices = await fetchPrices(Array.from(typeIds))
          logger.info('Prices loaded', { module: 'AssetStore', count: prices.size })
        } catch (err) {
          logger.error('Failed to fetch prices', err instanceof Error ? err : undefined, { module: 'AssetStore' })
        }
      }

      // Save to IndexedDB
      await saveToDB(results, allNames, prices, lastUpdated)

      set({
        assetsByOwner: results,
        assetNames: allNames,
        prices,
        lastUpdated,
        isUpdating: false,
        updateProgress: null,
        updateError: results.length === 0 ? 'Failed to fetch any assets' : null,
      })

      logger.info('Assets updated', {
        module: 'AssetStore',
        owners: results.length,
        totalAssets: results.reduce((sum, r) => sum + r.assets.length, 0),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateProgress: null, updateError: message })
      logger.error('Asset update failed', err instanceof Error ? err : undefined, { module: 'AssetStore' })
    }
  },

  clear: async () => {
    await clearDB()
    set({
      assetsByOwner: [],
      assetNames: new Map(),
      prices: new Map(),
      lastUpdated: null,
      updateError: null,
      updateProgress: null,
    })
  },
}))
