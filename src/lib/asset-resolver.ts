import type { ESIAsset } from '@/api/endpoints/assets'
import type { ESIContract, ESIContractItem } from '@/api/endpoints/contracts'
import type { ESIIndustryJob } from '@/api/endpoints/industry'
import type { MarketOrder } from '@/store/market-orders-store'
import type { Owner } from '@/store/auth-store'
import type { ResolvedAsset, AssetModeFlags } from './resolved-asset'
import {
  CategoryIds,
  HANGAR_FLAGS,
  DELIVERY_FLAGS,
  ASSET_SAFETY_FLAGS,
  OFFICE_TYPE_ID,
  isFittedOrContentFlag,
} from './tree-types'
import { getType, getStructure, getLocation } from '@/store/reference-cache'
import { usePriceStore } from '@/store/price-store'
import {
  isIndustryJobBpcProduct,
  PLAYER_STRUCTURE_ID_THRESHOLD,
} from './eve-constants'

interface SyntheticLocationInfo {
  isStructure: boolean
  systemId: number | undefined
  regionId: number | undefined
}

function resolveSyntheticLocation(locationId: number): SyntheticLocationInfo {
  const isStructure = locationId >= PLAYER_STRUCTURE_ID_THRESHOLD
  let systemId: number | undefined
  let regionId: number | undefined

  if (isStructure) {
    const structure = getStructure(locationId)
    if (structure?.solarSystemId) {
      const system = getLocation(structure.solarSystemId)
      systemId = structure.solarSystemId
      regionId = system?.regionId
    }
  } else if (locationId) {
    const location = getLocation(locationId)
    systemId = location?.solarSystemId
    regionId = location?.regionId
  }

  return { isStructure, systemId, regionId }
}

type SyntheticAssetType = 'contract' | 'marketOrder' | 'industryJob'

function createSyntheticModeFlags(
  type: SyntheticAssetType,
  isStructure: boolean
): AssetModeFlags {
  return {
    inHangar: false,
    inShipHangar: false,
    inItemHangar: false,
    inDeliveries: false,
    inAssetSafety: false,
    inOffice: false,
    inStructure: isStructure,
    isContract: type === 'contract',
    isMarketOrder: type === 'marketOrder',
    isIndustryJob: type === 'industryJob',
    isOwnedStructure: false,
    isActiveShip: false,
  }
}

export interface AssetLookupMap {
  itemIdToAsset: Map<number, ESIAsset>
  itemIdToOwner: Map<number, Owner>
}

export interface ResolutionContext {
  assetNames: Map<number, string>
  ownedStructureIds: Set<number>
  starbaseMoonIds: Map<number, number>
}

export function buildAssetLookupMap(
  assetsByOwner: Array<{ owner: Owner; assets: ESIAsset[] }>
): AssetLookupMap {
  const itemIdToAsset = new Map<number, ESIAsset>()
  const itemIdToOwner = new Map<number, Owner>()

  for (const { owner, assets } of assetsByOwner) {
    for (const asset of assets) {
      itemIdToAsset.set(asset.item_id, asset)
      itemIdToOwner.set(asset.item_id, owner)
    }
  }

  return { itemIdToAsset, itemIdToOwner }
}

export function buildParentChain(
  asset: ESIAsset,
  itemIdToAsset: Map<number, ESIAsset>
): ESIAsset[] {
  const chain: ESIAsset[] = []
  const visited = new Set<number>()
  let current = asset

  while (current.location_type === 'item') {
    if (visited.has(current.item_id)) break
    visited.add(current.item_id)
    const parent = itemIdToAsset.get(current.location_id)
    if (!parent) break
    chain.push(parent)
    current = parent
  }

  return chain
}

export function getRootFlag(asset: ESIAsset, parentChain: ESIAsset[]): string {
  if (parentChain.length === 0) {
    return asset.location_flag
  }
  return parentChain[parentChain.length - 1]!.location_flag
}

interface RootLocationInfo {
  rootLocationId: number
  rootLocationType: 'station' | 'structure' | 'solar_system'
  systemId: number | undefined
  regionId: number | undefined
}

export function resolveRootLocation(
  asset: ESIAsset,
  parentChain: ESIAsset[],
  starbaseMoonIds: Map<number, number>
): RootLocationInfo {
  const rootAsset =
    parentChain.length > 0 ? parentChain[parentChain.length - 1]! : asset
  const rootLocationId = rootAsset.location_id
  const rootLocationType = rootAsset.location_type

  let locationId: number
  let locationType: 'station' | 'structure' | 'solar_system'
  let systemId: number | undefined
  let regionId: number | undefined

  if (rootLocationId >= PLAYER_STRUCTURE_ID_THRESHOLD) {
    locationId = rootLocationId
    locationType = 'structure'
    const structure = getStructure(rootLocationId)
    if (structure?.solarSystemId) {
      const system = getLocation(structure.solarSystemId)
      systemId = structure.solarSystemId
      regionId = system?.regionId
    }
  } else if (rootLocationType === 'solar_system') {
    const rootType = getType(rootAsset.type_id)
    if (rootType?.categoryId === CategoryIds.STRUCTURE) {
      locationId = rootAsset.item_id
      locationType = 'structure'
      const structure = getStructure(rootAsset.item_id)
      if (structure?.solarSystemId) {
        const system = getLocation(structure.solarSystemId)
        systemId = structure.solarSystemId
        regionId = system?.regionId
      }
    } else if (rootType?.categoryId === CategoryIds.STARBASE) {
      locationId = rootAsset.item_id
      locationType = 'structure'
      const moonId = starbaseMoonIds.get(rootAsset.item_id)
      if (moonId) {
        const moon = getLocation(moonId)
        systemId = moon?.solarSystemId
        regionId = moon?.regionId
      } else {
        const system = getLocation(rootLocationId)
        systemId = rootLocationId
        regionId = system?.regionId
      }
    } else {
      locationId = rootLocationId
      locationType = 'solar_system'
      const system = getLocation(rootLocationId)
      systemId = rootLocationId
      regionId = system?.regionId
    }
  } else {
    locationId = rootLocationId
    locationType = 'station'
    const location = getLocation(rootLocationId)
    systemId = location?.solarSystemId
    regionId = location?.regionId
  }

  return {
    rootLocationId: locationId,
    rootLocationType: locationType,
    systemId,
    regionId,
  }
}

export function computeModeFlags(
  asset: ESIAsset,
  parentChain: ESIAsset[],
  rootFlag: string,
  ownedStructureIds: Set<number>
): AssetModeFlags {
  const type = getType(asset.type_id)
  const isShip = type?.categoryId === CategoryIds.SHIP
  const inHangar = HANGAR_FLAGS.has(rootFlag)

  const hasOfficeInChain = parentChain.some((p) => p.type_id === OFFICE_TYPE_ID)

  let inStructure = false
  if (parentChain.length > 0) {
    const rootParent = parentChain[parentChain.length - 1]!
    const rootParentType = getType(rootParent.type_id)
    inStructure = rootParentType?.categoryId === CategoryIds.STRUCTURE
  }

  const isActiveShip = rootFlag === 'ActiveShip'
  const isDirectlyInOwnedStructure = ownedStructureIds.has(asset.location_id)
  const isOwnedStructure =
    ownedStructureIds.has(asset.item_id) ||
    (isDirectlyInOwnedStructure && isFittedOrContentFlag(asset.location_flag))

  return {
    inHangar,
    inShipHangar: isShip && inHangar,
    inItemHangar: !isShip && inHangar,
    inDeliveries: DELIVERY_FLAGS.has(rootFlag),
    inAssetSafety: ASSET_SAFETY_FLAGS.has(rootFlag),
    inOffice: hasOfficeInChain,
    inStructure,
    isContract: asset.location_flag === 'InContract',
    isMarketOrder: asset.location_flag === 'SellOrder',
    isIndustryJob: asset.location_flag === 'IndustryJob',
    isOwnedStructure,
    isActiveShip,
  }
}

export function resolveAsset(
  asset: ESIAsset,
  owner: Owner,
  lookupMap: AssetLookupMap,
  context: ResolutionContext
): ResolvedAsset {
  const { itemIdToAsset } = lookupMap
  const { assetNames, ownedStructureIds, starbaseMoonIds } = context

  const parentChain = buildParentChain(asset, itemIdToAsset)
  const rootFlag = getRootFlag(asset, parentChain)
  const parentStructure = getStructure(asset.location_id)
  const parentIsUnresolvable =
    !parentStructure || parentStructure.inaccessible === true
  const hasOrphanedParent =
    asset.location_type === 'item' &&
    parentChain.length === 0 &&
    !itemIdToAsset.has(asset.location_id) &&
    parentIsUnresolvable &&
    !getLocation(asset.location_id)
  const rootLocation = resolveRootLocation(asset, parentChain, starbaseMoonIds)
  const modeFlags = computeModeFlags(
    asset,
    parentChain,
    rootFlag,
    ownedStructureIds
  )

  const sdeType = getType(asset.type_id)
  const customName = assetNames.get(asset.item_id)
  const isBpc = asset.is_blueprint_copy ?? false

  const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
  const price = usePriceStore.getState().getItemPrice(asset.type_id, {
    itemId: asset.item_id,
    isBlueprintCopy: isBpc,
  })

  return {
    asset,
    owner,

    rootLocationId: rootLocation.rootLocationId,
    rootLocationType: rootLocation.rootLocationType,
    parentChain,
    rootFlag,
    hasOrphanedParent,

    systemId: rootLocation.systemId,
    regionId: rootLocation.regionId,

    typeId: asset.type_id,
    categoryId: sdeType?.categoryId ?? 0,
    groupId: sdeType?.groupId ?? 0,
    volume,

    price,
    totalValue: price * asset.quantity,
    totalVolume: volume * asset.quantity,

    modeFlags,

    customName,
    isBlueprintCopy: isBpc,
  }
}

export function resolveAllAssets(
  assetsByOwner: Array<{ owner: Owner; assets: ESIAsset[] }>,
  context: ResolutionContext
): ResolvedAsset[] {
  const lookupMap = buildAssetLookupMap(assetsByOwner)
  const results: ResolvedAsset[] = []

  for (const { owner, assets } of assetsByOwner) {
    for (const asset of assets) {
      const type = getType(asset.type_id)
      if (
        type?.categoryId === CategoryIds.OWNER ||
        type?.categoryId === CategoryIds.STATION
      ) {
        continue
      }
      results.push(resolveAsset(asset, owner, lookupMap, context))
    }
  }

  return results
}

export function resolveMarketOrder(
  order: MarketOrder,
  owner: Owner
): ResolvedAsset {
  const loc = resolveSyntheticLocation(order.location_id)

  const syntheticAsset: ESIAsset = {
    item_id: order.order_id,
    type_id: order.type_id,
    location_id: order.location_id,
    location_type: loc.isStructure ? 'other' : 'station',
    location_flag: 'SellOrder',
    quantity: order.volume_remain,
    is_singleton: false,
  }

  const sdeType = getType(order.type_id)
  const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
  const price = usePriceStore.getState().getItemPrice(order.type_id)

  return {
    asset: syntheticAsset,
    owner,
    rootLocationId: order.location_id,
    rootLocationType: loc.isStructure ? 'structure' : 'station',
    parentChain: [],
    rootFlag: 'SellOrder',
    hasOrphanedParent: false,
    systemId: loc.systemId,
    regionId: loc.regionId,
    typeId: order.type_id,
    categoryId: sdeType?.categoryId ?? 0,
    groupId: sdeType?.groupId ?? 0,
    volume,
    price,
    totalValue: price * order.volume_remain,
    totalVolume: volume * order.volume_remain,
    modeFlags: createSyntheticModeFlags('marketOrder', loc.isStructure),
    customName: undefined,
    isBlueprintCopy: false,
  }
}

export function resolveContractItem(
  contract: ESIContract,
  item: ESIContractItem,
  owner: Owner
): ResolvedAsset {
  const locationId = contract.start_location_id ?? 0
  const loc = resolveSyntheticLocation(locationId)
  const isBpc = item.is_blueprint_copy ?? false

  const syntheticAsset: ESIAsset = {
    item_id: contract.contract_id * 1_000_000 + item.record_id,
    type_id: item.type_id,
    location_id: locationId,
    location_type: loc.isStructure ? 'other' : 'station',
    location_flag: 'InContract',
    quantity: item.quantity,
    is_singleton: item.is_singleton ?? false,
    is_blueprint_copy: item.is_blueprint_copy,
  }

  const sdeType = getType(item.type_id)
  const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
  const price = usePriceStore.getState().getItemPrice(item.type_id, {
    itemId: item.item_id,
    isBlueprintCopy: isBpc,
  })

  return {
    asset: syntheticAsset,
    owner,
    rootLocationId: locationId,
    rootLocationType: loc.isStructure ? 'structure' : 'station',
    parentChain: [],
    rootFlag: 'InContract',
    hasOrphanedParent: false,
    systemId: loc.systemId,
    regionId: loc.regionId,
    typeId: item.type_id,
    categoryId: sdeType?.categoryId ?? 0,
    groupId: sdeType?.groupId ?? 0,
    volume,
    price,
    totalValue: price * item.quantity,
    totalVolume: volume * item.quantity,
    modeFlags: createSyntheticModeFlags('contract', loc.isStructure),
    customName: undefined,
    isBlueprintCopy: isBpc,
  }
}

export function resolveIndustryJob(
  job: ESIIndustryJob,
  owner: Owner
): ResolvedAsset {
  const locationId = job.location_id ?? job.facility_id
  const loc = resolveSyntheticLocation(locationId)
  const productTypeId = job.product_type_id ?? job.blueprint_type_id
  const isBpcProduct = isIndustryJobBpcProduct(job.activity_id)

  const syntheticAsset: ESIAsset = {
    item_id: job.job_id,
    type_id: productTypeId,
    location_id: locationId,
    location_type: loc.isStructure ? 'other' : 'station',
    location_flag: 'IndustryJob',
    quantity: job.runs,
    is_singleton: false,
  }

  const sdeType = getType(productTypeId)
  const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
  const price = usePriceStore.getState().getItemPrice(productTypeId, {
    isBlueprintCopy: isBpcProduct,
  })

  return {
    asset: syntheticAsset,
    owner,
    rootLocationId: locationId,
    rootLocationType: loc.isStructure ? 'structure' : 'station',
    parentChain: [],
    rootFlag: 'IndustryJob',
    hasOrphanedParent: false,
    systemId: loc.systemId,
    regionId: loc.regionId,
    typeId: productTypeId,
    categoryId: sdeType?.categoryId ?? 0,
    groupId: sdeType?.groupId ?? 0,
    volume,
    price,
    totalValue: price * job.runs,
    totalVolume: volume * job.runs,
    modeFlags: createSyntheticModeFlags('industryJob', loc.isStructure),
    customName: undefined,
    isBlueprintCopy: isBpcProduct,
  }
}
