import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { useMarketOrdersStore } from './market-orders-store'
import { useIndustryJobsStore } from './industry-jobs-store'
import { useContractsStore } from './contracts-store'
import { useClonesStore } from './clones-store'
import { useWalletStore } from './wallet-store'
import { useBlueprintsStore } from './blueprints-store'
import { getCharacterAssets, getCharacterAssetNames, getCorporationAssetNames, type ESIAsset, type ESIAssetName } from '@/api/endpoints/assets'
import { getCorporationAssets } from '@/api/endpoints/corporation'
import { fetchPrices } from '@/api/ref-client'
import { fetchAbyssalPrices, isAbyssalTypeId, hasCachedAbyssalPrice } from '@/api/mutamarket-client'
import { getType, getTypeName } from '@/store/reference-cache'

import { logger } from '@/lib/logger'

const NAMEABLE_CATEGORIES = new Set([6, 22, 65])
const NAMEABLE_GROUPS = new Set([12, 14, 340, 448, 649])

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
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
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

function isNameable(typeId: number): boolean {
  const type = getType(typeId)
  if (!type) return false
  return NAMEABLE_CATEGORIES.has(type.categoryId) || NAMEABLE_GROUPS.has(type.groupId)
}

async function fetchOwnerAssetNames(owner: Owner, assets: ESIAsset[]): Promise<ESIAssetName[]> {
  const nameableIds = assets
    .filter((a) => a.is_singleton && isNameable(a.type_id))
    .map((a) => a.item_id)
  if (nameableIds.length === 0) return []
  if (owner.type === 'corporation') {
    try {
      return await getCorporationAssetNames(owner.id, owner.characterId, nameableIds)
    } catch {
      return []
    }
  }
  return getCharacterAssetNames(owner.id, owner.characterId, nameableIds)
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

          const itemToType = new Map<number, number>()
          for (const asset of assets) {
            itemToType.set(asset.item_id, asset.type_id)
          }

          const names = await fetchOwnerAssetNames(owner, assets)
          for (const n of names) {
            if (n.name && n.name !== 'None') {
              const typeId = itemToType.get(n.item_id)
              const typeName = typeId ? getTypeName(typeId) : ''
              allNames.set(n.item_id, typeName ? `${typeName} (${n.name})` : n.name)
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

      // Update other stores first so we can collect their type IDs for pricing
      await Promise.all([
        useMarketOrdersStore.getState().update(true),
        useIndustryJobsStore.getState().update(true),
        useContractsStore.getState().update(true),
        useClonesStore.getState().update(true),
        useWalletStore.getState().update(true),
        useBlueprintsStore.getState().update(true),
      ])

      // Collect all type IDs that need prices
      const typeIds = new Set<number>()
      for (const { assets } of results) {
        for (const asset of assets) {
          typeIds.add(asset.type_id)
        }
      }

      // Add industry job product type IDs
      const industryJobs = useIndustryJobsStore.getState().jobsByOwner
      for (const { jobs } of industryJobs) {
        for (const job of jobs) {
          if (job.product_type_id) {
            typeIds.add(job.product_type_id)
          }
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

      const abyssalItemIds: number[] = []
      for (const { assets } of results) {
        for (const asset of assets) {
          if (isAbyssalTypeId(asset.type_id) && !hasCachedAbyssalPrice(asset.item_id)) {
            abyssalItemIds.push(asset.item_id)
          }
        }
      }
      if (abyssalItemIds.length > 0) {
        try {
          await fetchAbyssalPrices(abyssalItemIds)
        } catch (err) {
          logger.error('Failed to fetch abyssal prices', err instanceof Error ? err : undefined, { module: 'AssetStore' })
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

  updateForOwner: async (owner: Owner) => {
    const state = get()
    if (state.isUpdating) return

    set({ isUpdating: true, updateError: null, updateProgress: { current: 0, total: 1 } })

    try {
      logger.info('Fetching assets for new owner', { module: 'AssetStore', owner: owner.name, type: owner.type })
      const assets = await fetchOwnerAssets(owner)
      const newOwnerAssets: OwnerAssets = { owner, assets }

      const itemToType = new Map<number, number>()
      for (const asset of assets) {
        itemToType.set(asset.item_id, asset.type_id)
      }

      const newNames = new Map(state.assetNames)
      const names = await fetchOwnerAssetNames(owner, assets)
      for (const n of names) {
        if (n.name && n.name !== 'None') {
          const typeId = itemToType.get(n.item_id)
          const typeName = typeId ? getTypeName(typeId) : ''
          newNames.set(n.item_id, typeName ? `${typeName} (${n.name})` : n.name)
        }
      }

      const typeIds = new Set<number>()
      for (const asset of assets) {
        typeIds.add(asset.type_id)
      }

      const newPrices = new Map(state.prices)
      if (typeIds.size > 0) {
        try {
          const fetchedPrices = await fetchPrices(Array.from(typeIds))
          for (const [id, price] of fetchedPrices) {
            newPrices.set(id, price)
          }
        } catch (err) {
          logger.error('Failed to fetch prices', err instanceof Error ? err : undefined, { module: 'AssetStore' })
        }
      }

      const abyssalItemIds: number[] = []
      for (const asset of assets) {
        if (isAbyssalTypeId(asset.type_id) && !hasCachedAbyssalPrice(asset.item_id)) {
          abyssalItemIds.push(asset.item_id)
        }
      }
      if (abyssalItemIds.length > 0) {
        try {
          await fetchAbyssalPrices(abyssalItemIds)
        } catch (err) {
          logger.error('Failed to fetch abyssal prices', err instanceof Error ? err : undefined, { module: 'AssetStore' })
        }
      }

      const ownerKey = `${owner.type}-${owner.id}`
      const updatedAssets = state.assetsByOwner.filter(
        (oa) => `${oa.owner.type}-${oa.owner.id}` !== ownerKey
      )
      updatedAssets.push(newOwnerAssets)

      const lastUpdated = Date.now()
      await saveToDB(updatedAssets, newNames, newPrices, lastUpdated)

      set({
        assetsByOwner: updatedAssets,
        assetNames: newNames,
        prices: newPrices,
        lastUpdated,
        isUpdating: false,
        updateProgress: null,
        updateError: null,
      })

      logger.info('Assets updated for owner', {
        module: 'AssetStore',
        owner: owner.name,
        assets: assets.length,
      })

      await Promise.all([
        useMarketOrdersStore.getState().updateForOwner(owner),
        useIndustryJobsStore.getState().updateForOwner(owner),
        useContractsStore.getState().updateForOwner(owner),
        useClonesStore.getState().updateForOwner(owner),
        useWalletStore.getState().updateForOwner(owner),
        useBlueprintsStore.getState().updateForOwner(owner),
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateProgress: null, updateError: message })
      logger.error('Asset update failed for owner', err instanceof Error ? err : undefined, { module: 'AssetStore' })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.assetsByOwner.filter(
      (oa) => `${oa.owner.type}-${oa.owner.id}` !== ownerKey
    )

    if (updated.length === state.assetsByOwner.length) return

    await saveToDB(updated, state.assetNames, state.prices, state.lastUpdated ?? Date.now())
    set({ assetsByOwner: updated })

    logger.info('Assets removed for owner', { module: 'AssetStore', ownerKey })

    await Promise.all([
      useMarketOrdersStore.getState().removeForOwner(ownerType, ownerId),
      useIndustryJobsStore.getState().removeForOwner(ownerType, ownerId),
      useContractsStore.getState().removeForOwner(ownerType, ownerId),
      useClonesStore.getState().removeForOwner(ownerType, ownerId),
      useWalletStore.getState().removeForOwner(ownerType, ownerId),
      useBlueprintsStore.getState().removeForOwner(ownerType, ownerId),
    ])
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

    await Promise.all([
      useMarketOrdersStore.getState().clear(),
      useIndustryJobsStore.getState().clear(),
      useContractsStore.getState().clear(),
      useClonesStore.getState().clear(),
      useWalletStore.getState().clear(),
      useBlueprintsStore.getState().clear(),
    ])
  },
}))
