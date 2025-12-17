import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey, ownerKey as makeOwnerKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { getCharacterAssetNames, getCorporationAssetNames, type ESIAsset, type ESIAssetName } from '@/api/endpoints/assets'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIAssetSchema } from '@/api/schemas'
import { fetchPrices, resolveTypes } from '@/api/ref-client'
import { getType, getContractItemsSync } from '@/store/reference-cache'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { triggerResolution } from '@/lib/data-resolver'
import { useContractsStore, type OwnerContracts } from './contracts-store'
import { useMarketOrdersStore, type OwnerOrders } from './market-orders-store'
import { useIndustryJobsStore, type OwnerJobs } from './industry-jobs-store'
import { useStructuresStore, type OwnerStructures } from './structures-store'

const NAMEABLE_CATEGORIES = new Set([6, 22, 65])
const NAMEABLE_GROUPS = new Set([12, 14, 340, 448, 649])
const ENDPOINT_PATTERN = '/assets/'

export interface OwnerAssets {
  owner: Owner
  assets: ESIAsset[]
}

interface AssetState {
  assetsByOwner: OwnerAssets[]
  unifiedAssetsByOwner: OwnerAssets[]
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
  rebuildSyntheticAssets: () => void
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

function collectAllTypeIds(
  assetsByOwner: OwnerAssets[],
  ordersByOwner: OwnerOrders[],
  contractsByOwner: OwnerContracts[],
  jobsByOwner: OwnerJobs[],
  structuresByOwner: OwnerStructures[]
): Set<number> {
  const typeIds = new Set<number>()

  for (const { assets } of assetsByOwner) {
    for (const asset of assets) {
      typeIds.add(asset.type_id)
    }
  }

  for (const { orders } of ordersByOwner) {
    for (const order of orders) {
      typeIds.add(order.type_id)
    }
  }

  for (const { contracts } of contractsByOwner) {
    for (const { contract } of contracts) {
      const items = getContractItemsSync(contract.contract_id)
      if (items) {
        for (const item of items) {
          typeIds.add(item.type_id)
        }
      }
    }
  }

  for (const { jobs } of jobsByOwner) {
    for (const job of jobs) {
      if (job.product_type_id) {
        typeIds.add(job.product_type_id)
      }
    }
  }

  for (const { structures } of structuresByOwner) {
    for (const structure of structures) {
      typeIds.add(structure.type_id)
    }
  }

  return typeIds
}

function buildSyntheticAssets(
  contractsByOwner: OwnerContracts[],
  ordersByOwner: OwnerOrders[],
  jobsByOwner: OwnerJobs[],
  structuresByOwner: OwnerStructures[]
): Map<string, ESIAsset[]> {
  const owners = Object.values(useAuthStore.getState().owners).filter((o): o is Owner => !!o)
  const ownerCharIds = new Set(owners.map((o) => o.characterId))
  const ownerCorpIds = new Set(owners.filter((o) => o.corporationId).map((o) => o.corporationId))

  const syntheticByOwner = new Map<string, ESIAsset[]>()

  for (const { owner, contracts } of contractsByOwner) {
    const key = makeOwnerKey(owner.type, owner.id)
    const synthetics: ESIAsset[] = syntheticByOwner.get(key) ?? []

    for (const { contract } of contracts) {
      if (contract.status !== 'outstanding') continue
      const isIssuer = ownerCharIds.has(contract.issuer_id) || ownerCorpIds.has(contract.issuer_corporation_id)
      if (!isIssuer) continue

      const items = getContractItemsSync(contract.contract_id)
      if (!items) continue

      const locationId = contract.start_location_id ?? 0

      for (const item of items) {
        if (!item.is_included) continue
        synthetics.push({
          item_id: item.record_id,
          type_id: item.type_id,
          location_id: locationId,
          location_type: locationId > 1_000_000_000_000 ? 'other' : 'station',
          location_flag: 'InContract',
          quantity: item.quantity,
          is_singleton: item.is_singleton ?? false,
          is_blueprint_copy: item.is_blueprint_copy,
        })
      }
    }
    syntheticByOwner.set(key, synthetics)
  }

  for (const { owner, orders } of ordersByOwner) {
    const key = makeOwnerKey(owner.type, owner.id)
    const synthetics: ESIAsset[] = syntheticByOwner.get(key) ?? []

    for (const order of orders) {
      if (order.is_buy_order) continue
      if (order.volume_remain <= 0) continue

      synthetics.push({
        item_id: order.order_id,
        type_id: order.type_id,
        location_id: order.location_id,
        location_type: order.location_id > 1_000_000_000_000 ? 'other' : 'station',
        location_flag: 'SellOrder',
        quantity: order.volume_remain,
        is_singleton: false,
      })
    }
    syntheticByOwner.set(key, synthetics)
  }

  for (const { owner, jobs } of jobsByOwner) {
    const key = makeOwnerKey(owner.type, owner.id)
    const synthetics: ESIAsset[] = syntheticByOwner.get(key) ?? []

    for (const job of jobs) {
      if (job.status !== 'active' && job.status !== 'ready') continue
      const productTypeId = job.product_type_id ?? job.blueprint_type_id

      synthetics.push({
        item_id: job.job_id,
        type_id: productTypeId,
        location_id: job.facility_id,
        location_type: job.facility_id > 1_000_000_000_000 ? 'other' : 'station',
        location_flag: 'IndustryJob',
        quantity: job.runs,
        is_singleton: false,
      })
    }
    syntheticByOwner.set(key, synthetics)
  }

  for (const { owner, structures } of structuresByOwner) {
    const key = makeOwnerKey(owner.type, owner.id)
    const synthetics: ESIAsset[] = syntheticByOwner.get(key) ?? []

    for (const structure of structures) {
      synthetics.push({
        item_id: Number(structure.structure_id),
        type_id: structure.type_id,
        location_id: structure.structure_id,
        location_type: 'other',
        location_flag: 'Structure',
        quantity: 1,
        is_singleton: true,
      })
    }
    syntheticByOwner.set(key, synthetics)
  }

  return syntheticByOwner
}

export const useAssetStore = create<AssetStore>((set, get) => ({
  assetsByOwner: [],
  unifiedAssetsByOwner: [],
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
      get().rebuildSyntheticAssets()
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

          resolveTypes(Array.from(new Set(assets.map((a) => a.type_id))))
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

      const typeIds = collectAllTypeIds(
        results,
        useMarketOrdersStore.getState().dataByOwner,
        useContractsStore.getState().contractsByOwner,
        useIndustryJobsStore.getState().dataByOwner,
        useStructuresStore.getState().dataByOwner
      )

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

      await saveMetaToDB(allNames, prices)

      triggerResolution()

      set({
        assetsByOwner: results,
        assetNames: allNames,
        prices,
        isUpdating: false,
        updateProgress: null,
        updateError: results.length === 0 ? 'Failed to fetch any assets' : null,
      })
      get().rebuildSyntheticAssets()

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

      resolveTypes(Array.from(new Set(assets.map((a) => a.type_id))))
      const newNames = new Map(state.assetNames)
      const names = await fetchOwnerAssetNames(owner, assets)
      for (const n of names) {
        if (n.name && n.name !== 'None') {
          newNames.set(n.item_id, n.name)
        }
      }

      const updatedAssetsList = state.assetsByOwner
        .filter((oa) => `${oa.owner.type}-${oa.owner.id}` !== ownerKey)
        .concat([{ owner, assets }])

      const typeIds = collectAllTypeIds(
        updatedAssetsList,
        useMarketOrdersStore.getState().dataByOwner,
        useContractsStore.getState().contractsByOwner,
        useIndustryJobsStore.getState().dataByOwner,
        useStructuresStore.getState().dataByOwner
      )

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
      get().rebuildSyntheticAssets()

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
    const typeIds = collectAllTypeIds(
      state.assetsByOwner,
      useMarketOrdersStore.getState().dataByOwner,
      useContractsStore.getState().contractsByOwner,
      useIndustryJobsStore.getState().dataByOwner,
      useStructuresStore.getState().dataByOwner
    )

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

  rebuildSyntheticAssets: () => {
    const contractsByOwner = useContractsStore.getState().contractsByOwner
    const ordersByOwner = useMarketOrdersStore.getState().dataByOwner
    const jobsByOwner = useIndustryJobsStore.getState().dataByOwner
    const structuresByOwner = useStructuresStore.getState().dataByOwner

    const syntheticByOwner = buildSyntheticAssets(contractsByOwner, ordersByOwner, jobsByOwner, structuresByOwner)

    const state = get()
    const unifiedAssetsByOwner: OwnerAssets[] = state.assetsByOwner.map(({ owner, assets }) => {
      const key = makeOwnerKey(owner.type, owner.id)
      const synthetics = syntheticByOwner.get(key) ?? []
      return { owner, assets: [...assets, ...synthetics] }
    })

    set({ unifiedAssetsByOwner })
  },

  clear: async () => {
    await db.clear()
    set({
      assetsByOwner: [],
      unifiedAssetsByOwner: [],
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

export function setupSyntheticAssetSubscriptions(): void {
  const rebuild = () => useAssetStore.getState().rebuildSyntheticAssets()

  useContractsStore.subscribe(rebuild)
  useMarketOrdersStore.subscribe(rebuild)
  useIndustryJobsStore.subscribe(rebuild)
  useStructuresStore.subscribe(rebuild)
}
