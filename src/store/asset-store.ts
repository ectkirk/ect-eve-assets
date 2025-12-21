import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import {
  getCharacterAssetNames,
  getCorporationAssetNames,
  type ESIAsset,
  type ESIAssetName,
} from '@/api/endpoints/assets'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIAssetSchema } from '@/api/schemas'
import { fetchPrices, queuePriceRefresh, resolveTypes } from '@/api/ref-client'
import { getType } from '@/store/reference-cache'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { triggerResolution } from '@/lib/data-resolver'
import { useStoreRegistry } from './store-registry'
import { useContractsStore } from './contracts-store'
import { useMarketOrdersStore } from './market-orders-store'
import { useIndustryJobsStore } from './industry-jobs-store'
import { useStructuresStore } from './structures-store'
import { detectAndInjectActiveShip } from './active-ship-detection'
import { collectAllTypeIds } from './type-id-collector'

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
  lastPriceRefreshAt: number | null
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
  prices: Map<number, number>,
  lastPriceRefreshAt?: number | null
): Promise<void> {
  await db.saveMeta('assetNames', Array.from(assetNames.entries()))
  await db.saveMeta('prices', Array.from(prices.entries()))
  if (lastPriceRefreshAt !== undefined) {
    await db.saveMeta('lastPriceRefreshAt', lastPriceRefreshAt)
  }
}

function getAssetEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/assets/`
  }
  return `/characters/${owner.id}/assets/`
}

async function fetchOwnerAssetsWithMeta(
  owner: Owner
): Promise<ESIResponseMeta<ESIAsset[]>> {
  const endpoint = getAssetEndpoint(owner)
  return esi.fetchPaginatedWithMeta<ESIAsset>(endpoint, {
    characterId: owner.characterId,
    schema: ESIAssetSchema,
  })
}

function isNameable(typeId: number): boolean {
  const type = getType(typeId)
  if (!type) return false
  return (
    NAMEABLE_CATEGORIES.has(type.categoryId) ||
    NAMEABLE_GROUPS.has(type.groupId)
  )
}

async function fetchOwnerAssetNames(
  owner: Owner,
  assets: ESIAsset[]
): Promise<ESIAssetName[]> {
  const nameableIds = assets
    .filter((a) => a.is_singleton && isNameable(a.type_id))
    .map((a) => a.item_id)
  logger.debug('Nameable items', {
    module: 'AssetStore',
    owner: owner.name,
    count: nameableIds.length,
    total: assets.length,
  })
  if (nameableIds.length === 0) return []
  if (owner.type === 'corporation') {
    try {
      const names = await getCorporationAssetNames(
        owner.id,
        owner.characterId,
        nameableIds
      )
      logger.debug('Corp asset names returned', {
        module: 'AssetStore',
        count: names.length,
      })
      return names
    } catch (err) {
      logger.error(
        'Corp asset names failed',
        err instanceof Error ? err : undefined,
        { module: 'AssetStore' }
      )
      return []
    }
  }
  return getCharacterAssetNames(owner.id, owner.characterId, nameableIds)
}

const PRICE_REFRESH_INTERVAL_MS = 60 * 60 * 1000

export const useAssetStore = create<AssetStore>((set, get) => ({
  assetsByOwner: [],
  assetNames: new Map(),
  prices: new Map(),
  lastPriceRefreshAt: null,
  isUpdating: false,
  updateError: null,
  updateProgress: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const assetsByOwner = loaded.map((d) => ({
        owner: d.owner,
        assets: d.data,
      }))

      const assetNamesEntries =
        await db.loadMeta<[number, string][]>('assetNames')
      const pricesEntries = await db.loadMeta<[number, number][]>('prices')
      const lastPriceRefreshAt = await db.loadMeta<number | null>(
        'lastPriceRefreshAt'
      )
      const assetNames = new Map(assetNamesEntries ?? [])
      const prices = new Map(pricesEntries ?? [])

      set({
        assetsByOwner,
        assetNames,
        prices,
        lastPriceRefreshAt: lastPriceRefreshAt ?? null,
        initialized: true,
      })
      logger.info('Asset store initialized from DB', {
        module: 'AssetStore',
        owners: assetsByOwner.length,
        assets: assetsByOwner.reduce((sum, o) => sum + o.assets.length, 0),
      })

      const pricesAreStale =
        !lastPriceRefreshAt ||
        Date.now() - lastPriceRefreshAt > PRICE_REFRESH_INTERVAL_MS
      if (pricesAreStale && prices.size > 0) {
        logger.info('Prices are stale, triggering refresh', {
          module: 'AssetStore',
        })
        get().refreshPrices()
      }
    } catch (err) {
      logger.error(
        'Failed to load assets from DB',
        err instanceof Error ? err : undefined,
        { module: 'AssetStore' }
      )
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

    set({
      isUpdating: true,
      updateError: null,
      updateProgress: { current: 0, total: ownersToUpdate.length },
    })

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
          logger.info('Fetching assets', {
            module: 'AssetStore',
            owner: owner.name,
            type: owner.type,
          })
          const {
            data: assets,
            expiresAt,
            etag,
          } = await fetchOwnerAssetsWithMeta(owner)

          const activeShipResult = await detectAndInjectActiveShip(
            owner,
            assets,
            ownerKey
          )
          if (activeShipResult.syntheticShip) {
            assets.push(activeShipResult.syntheticShip)
            if (activeShipResult.shipItemId && activeShipResult.shipName) {
              allNames.set(
                activeShipResult.shipItemId,
                activeShipResult.shipName
              )
            }
          }

          await db.save(ownerKey, owner, assets)
          existingAssets.set(ownerKey, { owner, assets })

          useExpiryCacheStore
            .getState()
            .setExpiry(ownerKey, endpoint, expiresAt, etag)

          resolveTypes(Array.from(new Set(assets.map((a) => a.type_id))))
          const names = await fetchOwnerAssetNames(owner, assets)
          for (const n of names) {
            if (n.name && n.name !== 'None') {
              allNames.set(n.item_id, n.name)
            }
          }
        } catch (err) {
          logger.error(
            'Failed to fetch assets for owner',
            err instanceof Error ? err : undefined,
            {
              module: 'AssetStore',
              owner: owner.name,
            }
          )
        }
      }

      const results = Array.from(existingAssets.values())

      const typeIds = collectAllTypeIds(
        results,
        useMarketOrdersStore.getOrdersByOwner(),
        useContractsStore.getContractsByOwner(),
        useIndustryJobsStore.getJobsByOwner(),
        useStructuresStore.getState().dataByOwner
      )

      const prices = new Map(state.prices)
      let lastPriceRefreshAt = state.lastPriceRefreshAt
      if (typeIds.size > 0) {
        try {
          const fetchedPrices = await fetchPrices(Array.from(typeIds))
          for (const [id, price] of fetchedPrices) {
            prices.set(id, price)
          }
          lastPriceRefreshAt = Date.now()
          logger.info('Prices loaded', {
            module: 'AssetStore',
            count: prices.size,
          })
        } catch (err) {
          logger.error(
            'Failed to fetch prices',
            err instanceof Error ? err : undefined,
            { module: 'AssetStore' }
          )
        }
      }

      await saveMetaToDB(allNames, prices, lastPriceRefreshAt)

      triggerResolution()

      set({
        assetsByOwner: results,
        assetNames: allNames,
        prices,
        lastPriceRefreshAt,
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
      logger.error(
        'Asset update failed',
        err instanceof Error ? err : undefined,
        { module: 'AssetStore' }
      )
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()
    if (state.isUpdating) return

    set({
      isUpdating: true,
      updateError: null,
      updateProgress: { current: 0, total: 1 },
    })

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getAssetEndpoint(owner)

      logger.info('Fetching assets for owner', {
        module: 'AssetStore',
        owner: owner.name,
        type: owner.type,
      })
      const {
        data: assets,
        expiresAt,
        etag,
      } = await fetchOwnerAssetsWithMeta(owner)

      const newNames = new Map(state.assetNames)

      const activeShipResult = await detectAndInjectActiveShip(
        owner,
        assets,
        ownerKey
      )
      if (activeShipResult.syntheticShip) {
        assets.push(activeShipResult.syntheticShip)
        if (activeShipResult.shipItemId && activeShipResult.shipName) {
          newNames.set(activeShipResult.shipItemId, activeShipResult.shipName)
        }
      }

      await db.save(ownerKey, owner, assets)
      useExpiryCacheStore
        .getState()
        .setExpiry(ownerKey, endpoint, expiresAt, etag)

      resolveTypes(Array.from(new Set(assets.map((a) => a.type_id))))
      const names = await fetchOwnerAssetNames(owner, assets)
      for (const n of names) {
        if (n.name && n.name !== 'None') {
          newNames.set(n.item_id, n.name)
        }
      }

      const newPrices = new Map(state.prices)
      const ownerTypeIds = new Set(assets.map((a) => a.type_id))
      const deltaTypeIds = Array.from(ownerTypeIds).filter(
        (id) => !newPrices.has(id)
      )

      if (deltaTypeIds.length > 0) {
        try {
          const fetchedPrices = await queuePriceRefresh(deltaTypeIds)
          for (const [id, price] of fetchedPrices) {
            newPrices.set(id, price)
          }
        } catch (err) {
          logger.error(
            'Failed to fetch prices',
            err instanceof Error ? err : undefined,
            { module: 'AssetStore' }
          )
        }
      }

      await saveMetaToDB(newNames, newPrices)

      triggerResolution()

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
      logger.error(
        'Asset update failed for owner',
        err instanceof Error ? err : undefined,
        { module: 'AssetStore' }
      )
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
      logger.error(
        'Failed to persist prices',
        err instanceof Error ? err : undefined,
        { module: 'AssetStore' }
      )
    }
  },

  refreshPrices: async () => {
    const state = get()
    const typeIds = collectAllTypeIds(
      state.assetsByOwner,
      useMarketOrdersStore.getOrdersByOwner(),
      useContractsStore.getContractsByOwner(),
      useIndustryJobsStore.getJobsByOwner(),
      useStructuresStore.getState().dataByOwner
    )

    if (typeIds.size === 0) {
      logger.info('No assets to refresh prices for', { module: 'AssetStore' })
      return
    }

    logger.info('Refreshing prices', {
      module: 'AssetStore',
      typeCount: typeIds.size,
    })
    try {
      const fetchedPrices = await fetchPrices(Array.from(typeIds))
      const now = Date.now()
      const merged = new Map(get().prices)
      for (const [id, price] of fetchedPrices) {
        merged.set(id, price)
      }
      await saveMetaToDB(get().assetNames, merged, now)
      set({ prices: merged, lastPriceRefreshAt: now })
      logger.info('Prices refreshed', {
        module: 'AssetStore',
        count: merged.size,
      })
    } catch (err) {
      logger.error(
        'Failed to refresh prices',
        err instanceof Error ? err : undefined,
        { module: 'AssetStore' }
      )
    }
  },

  clear: async () => {
    await db.clear()
    set({
      assetsByOwner: [],
      assetNames: new Map(),
      prices: new Map(),
      lastPriceRefreshAt: null,
      updateError: null,
      updateProgress: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore
  .getState()
  .registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
    const owner = findOwnerByKey(ownerKeyStr)
    if (!owner) {
      logger.warn('Owner not found for refresh', {
        module: 'AssetStore',
        ownerKey: ownerKeyStr,
      })
      return
    }
    await useAssetStore.getState().updateForOwner(owner)
  })

useStoreRegistry.getState().register({
  name: 'assets',
  removeForOwner: useAssetStore.getState().removeForOwner,
  clear: useAssetStore.getState().clear,
  getIsUpdating: () => useAssetStore.getState().isUpdating,
  init: useAssetStore.getState().init,
  update: useAssetStore.getState().update,
})

let priceRefreshInterval: ReturnType<typeof setInterval> | null = null

function startPriceRefreshTimer() {
  if (priceRefreshInterval) return
  priceRefreshInterval = setInterval(async () => {
    const state = useAssetStore.getState()
    if (!state.initialized || state.isUpdating) return

    if (useExpiryCacheStore.getState().isPaused) return

    logger.info('Hourly price refresh triggered', { module: 'AssetStore' })
    await state.refreshPrices()
  }, PRICE_REFRESH_INTERVAL_MS)
}

export function stopPriceRefreshTimer() {
  if (priceRefreshInterval) {
    clearInterval(priceRefreshInterval)
    priceRefreshInterval = null
  }
}

startPriceRefreshTimer()
