import { create } from 'zustand'
import {
  useAuthStore,
  type Owner,
  findOwnerByKey,
  ownerKey,
} from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import {
  getCharacterAssetNames,
  getCorporationAssetNames,
  type ESIAsset,
  type ESIAssetName,
} from '@/api/endpoints/assets'
import {
  getCharacterPublic,
  getCharacterRoles,
} from '@/api/endpoints/corporation'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { isNotInCorporationError } from '../../shared/esi-types'
import { ESIAssetSchema } from '@/api/schemas'
import { resolveTypes } from '@/api/ref-client'
import { getType } from '@/store/reference-cache'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { getErrorForLog, getUserFriendlyMessage } from '@/lib/errors'
import { ownerEndpoint } from '@/lib/owner-utils'
import {
  triggerResolution,
  registerCollector,
  needsTypeResolution,
  hasType,
  getType as getTypeFn,
  hasLocation,
  hasStructure,
  PLAYER_STRUCTURE_ID_THRESHOLD,
  type ResolutionIds,
} from '@/lib/data-resolver'
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
  return ownerEndpoint(owner, 'assets')
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

async function handleCharacterLeftCorporation(corpOwner: Owner): Promise<void> {
  const corpKey = ownerKey('corporation', corpOwner.id)
  const charKey = ownerKey('character', corpOwner.characterId)

  if (!useAuthStore.getState().getOwner(corpKey)) {
    return
  }

  logger.warn('Character no longer in corporation, removing corp', {
    module: 'AssetStore',
    characterId: corpOwner.characterId,
    corporationId: corpOwner.id,
    corporationName: corpOwner.name,
  })

  await useStoreRegistry
    .getState()
    .removeForOwnerAll('corporation', corpOwner.id)
  useExpiryCacheStore.getState().clearForOwner(corpKey)
  useAuthStore.getState().removeOwner(corpKey)

  try {
    const [charInfo, roles] = await Promise.all([
      getCharacterPublic(corpOwner.characterId),
      getCharacterRoles(corpOwner.characterId),
    ])

    const authStore = useAuthStore.getState()
    authStore.updateOwnerCorporationId(charKey, charInfo.corporation_id)
    authStore.updateOwnerRoles(charKey, roles)

    logger.info('Updated character corporation info after corp removal', {
      module: 'AssetStore',
      characterId: corpOwner.characterId,
      newCorporationId: charInfo.corporation_id,
      hasDirector: roles.roles?.includes('Director') ?? false,
    })
  } catch (refreshErr) {
    logger.warn('Failed to refresh character info after corp removal', {
      module: 'AssetStore',
      characterId: corpOwner.characterId,
      error: refreshErr,
    })
  }
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
      logger.error('Corp asset names failed', getErrorForLog(err), {
        module: 'AssetStore',
      })
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
        logger.error('Failed to load assets from DB', getErrorForLog(err), {
          module: 'AssetStore',
        })
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
          if (owner.type === 'corporation' && isNotInCorporationError(err)) {
            await handleCharacterLeftCorporation(owner)
            existingAssets.delete(ownerKey)
          } else {
            logger.error(
              'Failed to fetch assets for owner',
              getErrorForLog(err),
              {
                module: 'AssetStore',
                owner: owner.name,
              }
            )
          }
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
      set({
        isUpdating: false,
        updateProgress: null,
        updateError: getUserFriendlyMessage(err),
      })
      logger.error('Asset update failed', getErrorForLog(err), {
        module: 'AssetStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()
    if (state.isUpdating) return

    const ownerKeyStr = `${owner.type}-${owner.id}`

    set({
      isUpdating: true,
      updateError: null,
      updateProgress: { current: 0, total: 1 },
    })

    try {
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
        ownerKeyStr
      )
      if (activeShipResult.syntheticShip) {
        assets.push(activeShipResult.syntheticShip)
        if (activeShipResult.shipItemId && activeShipResult.shipName) {
          newNames.set(activeShipResult.shipItemId, activeShipResult.shipName)
        }
      }

      await db.save(ownerKeyStr, owner, assets)
      useExpiryCacheStore
        .getState()
        .setExpiry(ownerKeyStr, endpoint, expiresAt, etag)

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
            (oa) => `${oa.owner.type}-${oa.owner.id}` !== ownerKeyStr
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
      if (owner.type === 'corporation' && isNotInCorporationError(err)) {
        await handleCharacterLeftCorporation(owner)
        set((current) => ({
          assetsByOwner: current.assetsByOwner.filter(
            (oa) => `${oa.owner.type}-${oa.owner.id}` !== ownerKeyStr
          ),
          isUpdating: false,
          updateProgress: null,
          updateError: null,
        }))
      } else {
        set({
          isUpdating: false,
          updateProgress: null,
          updateError: getUserFriendlyMessage(err),
        })
        logger.error('Asset update failed for owner', getErrorForLog(err), {
          module: 'AssetStore',
        })
      }
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

registerCollector('assets', (ids: ResolutionIds) => {
  const { assetsByOwner } = useAssetStore.getState()
  const itemIdToAsset = new Map<number, ESIAsset>()
  const itemIdToOwner = new Map<number, Owner>()

  for (const { owner, assets } of assetsByOwner) {
    for (const asset of assets) {
      itemIdToAsset.set(asset.item_id, asset)
      itemIdToOwner.set(asset.item_id, owner)
    }
  }

  const getRootInfo = (
    asset: ESIAsset
  ): { structureId: number | null; owner: Owner | undefined } => {
    let current = asset
    let owner = itemIdToOwner.get(asset.item_id)
    while (current.location_type === 'item') {
      const parent = itemIdToAsset.get(current.location_id)
      if (!parent) break
      current = parent
      owner = itemIdToOwner.get(current.item_id)
    }
    if (current.location_id >= PLAYER_STRUCTURE_ID_THRESHOLD) {
      return { structureId: current.location_id, owner }
    }
    return { structureId: null, owner }
  }

  for (const { owner, assets } of assetsByOwner) {
    for (const asset of assets) {
      if (needsTypeResolution(asset.type_id)) {
        ids.typeIds.add(asset.type_id)
      }

      if (
        asset.location_type !== 'item' &&
        asset.location_id < PLAYER_STRUCTURE_ID_THRESHOLD &&
        !hasLocation(asset.location_id)
      ) {
        ids.locationIds.add(asset.location_id)
      }

      const type = hasType(asset.type_id)
        ? getTypeFn(asset.type_id)
        : undefined
      if (
        type?.categoryId === 65 &&
        asset.location_type === 'solar_system' &&
        !hasStructure(asset.item_id)
      ) {
        ids.structureToCharacter.set(asset.item_id, owner.characterId)
      }

      const { structureId, owner: rootOwner } = getRootInfo(asset)
      if (structureId && !hasStructure(structureId) && rootOwner) {
        ids.structureToCharacter.set(structureId, rootOwner.characterId)
      }
    }
  }
})
