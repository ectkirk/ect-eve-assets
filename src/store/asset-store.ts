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
import { resolveTypes } from '@/api/ref-client'
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
import { collectOwnedIds } from './type-id-collector'
import { isAbyssalTypeId } from '@/api/mutamarket-client'

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
  pruneStaleMetadata: () => Promise<void>
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

async function saveNamesToDB(assetNames: Map<number, string>): Promise<void> {
  await db.saveMeta('assetNames', Array.from(assetNames.entries()))
}

function getAssetEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/assets`
  }
  return `/characters/${owner.id}/assets`
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
  if (nameableIds.length === 0) return []
  if (owner.type === 'corporation') {
    try {
      const names = await getCorporationAssetNames(
        owner.id,
        owner.characterId,
        nameableIds
      )
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

let initPromise: Promise<void> | null = null

export const useAssetStore = create<AssetStore>((set, get) => ({
  assetsByOwner: [],
  assetNames: new Map(),
  isUpdating: false,
  updateError: null,
  updateProgress: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        const loaded = await db.loadAll()
        const assetsByOwner = loaded.map((d) => ({
          owner: d.owner,
          assets: d.data,
        }))

        const assetNamesEntries =
          await db.loadMeta<[number, string][]>('assetNames')
        const assetNames = new Map(assetNamesEntries ?? [])

        set({
          assetsByOwner,
          assetNames,
          initialized: true,
        })
        logger.info('Asset store initialized from DB', {
          module: 'AssetStore',
          owners: assetsByOwner.length,
          assets: assetsByOwner.reduce((sum, o) => sum + o.assets.length, 0),
        })

        const abyssalItemIds: number[] = []
        for (const { assets } of assetsByOwner) {
          for (const asset of assets) {
            if (isAbyssalTypeId(asset.type_id)) {
              abyssalItemIds.push(asset.item_id)
            }
          }
        }

        if (abyssalItemIds.length > 0) {
          const { usePriceStore } = await import('./price-store')
          usePriceStore.getState().ensureJitaPrices([], abyssalItemIds)
        }
      } catch (err) {
        logger.error(
          'Failed to load assets from DB',
          err instanceof Error ? err : undefined,
          { module: 'AssetStore' }
        )
        set({ initialized: true })
      }
    })()

    return initPromise
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

          await resolveTypes(Array.from(new Set(assets.map((a) => a.type_id))))
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

      const { typeIds, abyssalItemIds } = collectOwnedIds(
        results,
        useMarketOrdersStore.getOrdersByOwner(),
        useContractsStore.getContractsByOwner(),
        useIndustryJobsStore.getJobsByOwner(),
        useStructuresStore.getState().dataByOwner
      )

      if (typeIds.size > 0 || abyssalItemIds.size > 0) {
        const { usePriceStore } = await import('./price-store')
        await usePriceStore
          .getState()
          .ensureJitaPrices(Array.from(typeIds), Array.from(abyssalItemIds))
      }

      await saveNamesToDB(allNames)

      triggerResolution()

      set({
        assetsByOwner: results,
        assetNames: allNames,
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

      await resolveTypes(Array.from(new Set(assets.map((a) => a.type_id))))
      const names = await fetchOwnerAssetNames(owner, assets)
      for (const n of names) {
        if (n.name && n.name !== 'None') {
          newNames.set(n.item_id, n.name)
        }
      }

      const { usePriceStore, getJitaPrice } = await import('./price-store')
      const priceStore = usePriceStore.getState()

      const missingTypeIds: number[] = []
      const missingAbyssalIds: number[] = []

      for (const asset of assets) {
        if (getJitaPrice(asset.type_id) === undefined) {
          missingTypeIds.push(asset.type_id)
        }
        if (isAbyssalTypeId(asset.type_id)) {
          if (!priceStore.hasAbyssalPrice(asset.item_id)) {
            missingAbyssalIds.push(asset.item_id)
          }
        }
      }

      if (missingTypeIds.length > 0 || missingAbyssalIds.length > 0) {
        await priceStore.ensureJitaPrices(missingTypeIds, missingAbyssalIds)
      }

      await saveNamesToDB(newNames)

      triggerResolution()

      set((current) => ({
        assetsByOwner: [
          ...current.assetsByOwner.filter(
            (oa) => `${oa.owner.type}-${oa.owner.id}` !== ownerKey
          ),
          { owner, assets },
        ],
        assetNames: newNames,
        isUpdating: false,
        updateProgress: null,
        updateError: null,
      }))

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
    const ownerKey = `${ownerType}-${ownerId}`
    const hasOwner = get().assetsByOwner.some(
      (oa) => `${oa.owner.type}-${oa.owner.id}` === ownerKey
    )
    if (!hasOwner) return

    await db.delete(ownerKey)

    set((current) => ({
      assetsByOwner: current.assetsByOwner.filter(
        (oa) => `${oa.owner.type}-${oa.owner.id}` !== ownerKey
      ),
    }))

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Assets removed for owner', { module: 'AssetStore', ownerKey })

    get().pruneStaleMetadata()
  },

  pruneStaleMetadata: async () => {
    const currentState = get()
    const currentItemIds = new Set<number>()
    for (const { assets } of currentState.assetsByOwner) {
      for (const asset of assets) {
        currentItemIds.add(asset.item_id)
      }
    }

    const staleIds = new Set<number>()
    for (const itemId of currentState.assetNames.keys()) {
      if (!currentItemIds.has(itemId)) {
        staleIds.add(itemId)
      }
    }

    if (staleIds.size > 0) {
      set((current) => {
        const prunedNames = new Map<number, string>()
        for (const [itemId, name] of current.assetNames) {
          if (!staleIds.has(itemId)) {
            prunedNames.set(itemId, name)
          }
        }
        return { assetNames: prunedNames }
      })

      await saveNamesToDB(get().assetNames)
      logger.info('Pruned stale asset names', {
        module: 'AssetStore',
        namesRemoved: staleIds.size,
      })
    }
  },

  clear: async () => {
    await db.clear()
    initPromise = null
    set({
      assetsByOwner: [],
      assetNames: new Map(),
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
