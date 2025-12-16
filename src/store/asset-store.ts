import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { getCharacterAssetNames, getCorporationAssetNames, type ESIAsset, type ESIAssetName } from '@/api/endpoints/assets'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIAssetSchema } from '@/api/schemas'
import { fetchPrices, resolveTypes } from '@/api/ref-client'
import { fetchAbyssalPrices, isAbyssalTypeId, hasCachedAbyssalPrice } from '@/api/mutamarket-client'
import { getType } from '@/store/reference-cache'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'

const NAMEABLE_CATEGORIES = new Set([6, 22, 65])
const NAMEABLE_GROUPS = new Set([12, 14, 340, 448, 649])
const ENDPOINT_PATTERN = '/assets/'

export interface OwnerAssets {
  owner: Owner
  assets: ESIAsset[]
}

interface AssetState {
  assetsByOwner: OwnerAssets[]
  assetNames: Map<number, string>
  prices: Map<number, number>
  isUpdating: boolean
  updateError: string | null
  updateProgress: { current: number; total: number } | null
  initialized: boolean
}

interface AssetActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  setPrices: (newPrices: Map<number, number>) => Promise<void>
  refreshPrices: () => Promise<void>
  clear: () => Promise<void>
}

type AssetStore = AssetState & AssetActions

const db = createOwnerDB<ESIAsset[]>({
  dbName: 'ecteveassets-assets',
  storeName: 'assets',
  dataKey: 'assets',
  metaStoreName: 'meta',
  moduleName: 'AssetStore',
})

async function saveMetaToDB(
  assetNames: Map<number, string>,
  prices: Map<number, number>
): Promise<void> {
  await db.saveMeta('assetNames', Array.from(assetNames.entries()))
  await db.saveMeta('prices', Array.from(prices.entries()))
}

function getAssetEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/assets/`
  }
  return `/characters/${owner.id}/assets/`
}

async function fetchOwnerAssetsWithMeta(owner: Owner): Promise<ESIResponseMeta<ESIAsset[]>> {
  const endpoint = getAssetEndpoint(owner)
  return esi.fetchPaginatedWithMeta<ESIAsset>(endpoint, {
    characterId: owner.characterId,
    schema: ESIAssetSchema,
  })
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
  logger.debug('Nameable items', { module: 'AssetStore', owner: owner.name, count: nameableIds.length, total: assets.length })
  if (nameableIds.length === 0) return []
  if (owner.type === 'corporation') {
    try {
      const names = await getCorporationAssetNames(owner.id, owner.characterId, nameableIds)
      logger.debug('Corp asset names returned', { module: 'AssetStore', count: names.length })
      return names
    } catch (err) {
      logger.error('Corp asset names failed', err instanceof Error ? err : undefined, { module: 'AssetStore' })
      return []
    }
  }
  return getCharacterAssetNames(owner.id, owner.characterId, nameableIds)
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assetsByOwner: [],
  assetNames: new Map(),
  prices: new Map(),
  isUpdating: false,
  updateError: null,
  updateProgress: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const assetsByOwner = loaded.map((d) => ({ owner: d.owner, assets: d.data }))

      const assetNamesEntries = await db.loadMeta<[number, string][]>('assetNames')
      const pricesEntries = await db.loadMeta<[number, number][]>('prices')
      const assetNames = new Map(assetNamesEntries ?? [])
      const prices = new Map(pricesEntries ?? [])

      set({ assetsByOwner, assetNames, prices, initialized: true })
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

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? owners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : owners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getAssetEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need asset update', { module: 'AssetStore' })
      return
    }

    set({ isUpdating: true, updateError: null, updateProgress: { current: 0, total: ownersToUpdate.length } })

    try {
      const existingAssets = new Map(
        state.assetsByOwner.map((oa) => [`${oa.owner.type}-${oa.owner.id}`, oa])
      )
      const allNames = new Map(state.assetNames)

      for (let i = 0; i < ownersToUpdate.length; i++) {
        const owner = ownersToUpdate[i]
        if (!owner) continue
        set({ updateProgress: { current: i, total: ownersToUpdate.length } })

        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getAssetEndpoint(owner)

        try {
          logger.info('Fetching assets', { module: 'AssetStore', owner: owner.name, type: owner.type })
          const { data: assets, expiresAt, etag } = await fetchOwnerAssetsWithMeta(owner)

          await db.save(ownerKey, owner, assets)
          existingAssets.set(ownerKey, { owner, assets })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)

          await resolveTypes(Array.from(new Set(assets.map((a) => a.type_id))))
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

      const results = Array.from(existingAssets.values())

      const typeIds = new Set<number>()
      for (const { assets } of results) {
        for (const asset of assets) {
          typeIds.add(asset.type_id)
        }
      }

      const prices = new Map(state.prices)
      if (typeIds.size > 0) {
        try {
          const fetchedPrices = await fetchPrices(Array.from(typeIds))
          for (const [id, price] of fetchedPrices) {
            prices.set(id, price)
          }
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

      await saveMetaToDB(allNames, prices)

      set({
        assetsByOwner: results,
        assetNames: allNames,
        prices,
        isUpdating: false,
        updateProgress: null,
        updateError: results.length === 0 ? 'Failed to fetch any assets' : null,
      })

      logger.info('Assets updated', {
        module: 'AssetStore',
        owners: ownersToUpdate.length,
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
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getAssetEndpoint(owner)

      logger.info('Fetching assets for owner', { module: 'AssetStore', owner: owner.name, type: owner.type })
      const { data: assets, expiresAt, etag } = await fetchOwnerAssetsWithMeta(owner)

      await db.save(ownerKey, owner, assets)
      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)

      await resolveTypes(Array.from(new Set(assets.map((a) => a.type_id))))
      const newNames = new Map(state.assetNames)
      const names = await fetchOwnerAssetNames(owner, assets)
      for (const n of names) {
        if (n.name && n.name !== 'None') {
          newNames.set(n.item_id, n.name)
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

      await saveMetaToDB(newNames, newPrices)

      const updatedAssets = state.assetsByOwner.filter(
        (oa) => `${oa.owner.type}-${oa.owner.id}` !== ownerKey
      )
      updatedAssets.push({ owner, assets })

      set({
        assetsByOwner: updatedAssets,
        assetNames: newNames,
        prices: newPrices,
        isUpdating: false,
        updateProgress: null,
        updateError: null,
      })

      logger.info('Assets updated for owner', {
        module: 'AssetStore',
        owner: owner.name,
        assets: assets.length,
      })
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

    await db.delete(ownerKey)
    set({ assetsByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Assets removed for owner', { module: 'AssetStore', ownerKey })
  },

  setPrices: async (newPrices: Map<number, number>) => {
    const state = get()
    const merged = new Map(state.prices)
    for (const [id, price] of newPrices) {
      merged.set(id, price)
    }
    try {
      await saveMetaToDB(state.assetNames, merged)
      set({ prices: merged })
    } catch (err) {
      logger.error('Failed to persist prices', err instanceof Error ? err : undefined, { module: 'AssetStore' })
    }
  },

  refreshPrices: async () => {
    const state = get()
    const typeIds = new Set<number>()
    for (const { assets } of state.assetsByOwner) {
      for (const asset of assets) {
        typeIds.add(asset.type_id)
      }
    }

    if (typeIds.size === 0) {
      logger.info('No assets to refresh prices for', { module: 'AssetStore' })
      return
    }

    logger.info('Refreshing prices', { module: 'AssetStore', typeCount: typeIds.size })
    try {
      const fetchedPrices = await fetchPrices(Array.from(typeIds))
      await saveMetaToDB(state.assetNames, fetchedPrices)
      set({ prices: fetchedPrices })
      logger.info('Prices refreshed', { module: 'AssetStore', count: fetchedPrices.size })
    } catch (err) {
      logger.error('Failed to refresh prices', err instanceof Error ? err : undefined, { module: 'AssetStore' })
    }
  },

  clear: async () => {
    await db.clear()
    set({
      assetsByOwner: [],
      assetNames: new Map(),
      prices: new Map(),
      updateError: null,
      updateProgress: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'AssetStore', ownerKey: ownerKeyStr })
    return
  }
  await useAssetStore.getState().updateForOwner(owner)
})
