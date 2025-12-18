import type { ESIAsset } from '@/api/endpoints/assets'
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
import {
  getType,
  getTypeName,
  getStructure,
  getLocation,
  getAbyssalPrice,
  CategoryIds as RefCategoryIds,
} from '@/store/reference-cache'
import { formatBlueprintName } from '@/store/blueprints-store'
import { isAbyssalTypeId } from '@/api/mutamarket-client'

export interface AssetLookupMap {
  itemIdToAsset: Map<number, ESIAsset>
  itemIdToOwner: Map<number, Owner>
}

export interface ResolutionContext {
  prices: Map<number, number>
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
  let current = asset

  while (current.location_type === 'item') {
    const parent = itemIdToAsset.get(current.location_id)
    if (!parent) break
    chain.push(parent)
    current = parent
  }

  return chain
}

export function getRootFlag(
  asset: ESIAsset,
  parentChain: ESIAsset[]
): string {
  if (parentChain.length === 0) {
    return asset.location_flag
  }
  return parentChain[parentChain.length - 1]!.location_flag
}

interface RootLocationInfo {
  rootLocationId: number
  rootLocationType: 'station' | 'structure' | 'solar_system'
  locationName: string
  systemId: number | undefined
  systemName: string
  regionId: number | undefined
  regionName: string
}

export function resolveRootLocation(
  asset: ESIAsset,
  parentChain: ESIAsset[],
  starbaseMoonIds: Map<number, number>
): RootLocationInfo {
  const rootAsset = parentChain.length > 0 ? parentChain[parentChain.length - 1]! : asset
  const rootLocationId = rootAsset.location_id
  const rootLocationType = rootAsset.location_type

  let locationId: number
  let locationType: 'station' | 'structure' | 'solar_system'
  let locationName: string
  let systemId: number | undefined
  let systemName = ''
  let regionId: number | undefined
  let regionName = ''

  if (rootLocationId > 1_000_000_000_000) {
    locationId = rootLocationId
    locationType = 'structure'
    const structure = getStructure(rootLocationId)
    locationName = structure?.name ?? `Structure ${rootLocationId}`
    if (structure?.solarSystemId) {
      const system = getLocation(structure.solarSystemId)
      systemId = structure.solarSystemId
      systemName = system?.name ?? `System ${structure.solarSystemId}`
      regionId = system?.regionId
      regionName = system?.regionName ?? ''
    }
  } else if (rootLocationType === 'solar_system') {
    const rootType = getType(rootAsset.type_id)
    if (rootType?.categoryId === CategoryIds.STRUCTURE) {
      locationId = rootAsset.item_id
      locationType = 'structure'
      const structure = getStructure(rootAsset.item_id)
      locationName = structure?.name ?? `Structure ${rootAsset.item_id}`
      if (structure?.solarSystemId) {
        const system = getLocation(structure.solarSystemId)
        systemId = structure.solarSystemId
        systemName = system?.name ?? `System ${structure.solarSystemId}`
        regionId = system?.regionId
        regionName = system?.regionName ?? ''
      }
    } else if (rootType?.categoryId === CategoryIds.STARBASE) {
      locationId = rootAsset.item_id
      locationType = 'structure'
      const moonId = starbaseMoonIds.get(rootAsset.item_id)
      if (moonId) {
        const moon = getLocation(moonId)
        locationName = moon?.name ?? `Moon ${moonId}`
        systemId = moon?.solarSystemId
        systemName = moon?.solarSystemName ?? ''
        regionId = moon?.regionId
        regionName = moon?.regionName ?? ''
      } else {
        const system = getLocation(rootLocationId)
        locationName = system?.name ?? `System ${rootLocationId}`
        systemId = rootLocationId
        systemName = system?.name ?? ''
        regionId = system?.regionId
        regionName = system?.regionName ?? ''
      }
    } else {
      locationId = rootLocationId
      locationType = 'solar_system'
      const system = getLocation(rootLocationId)
      locationName = system?.name ?? `System ${rootLocationId}`
      systemId = rootLocationId
      systemName = system?.name ?? ''
      regionId = system?.regionId
      regionName = system?.regionName ?? ''
    }
  } else {
    locationId = rootLocationId
    locationType = 'station'
    const location = getLocation(rootLocationId)
    locationName = location?.name ?? `Location ${rootLocationId}`
    systemId = location?.solarSystemId
    systemName = location?.solarSystemName ?? ''
    regionId = location?.regionId
    regionName = location?.regionName ?? ''
  }

  if (!regionName) regionName = 'Unknown Region'

  return {
    rootLocationId: locationId,
    rootLocationType: locationType,
    locationName,
    systemId,
    systemName,
    regionId,
    regionName,
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

  const hasOfficeInChain = parentChain.some(p => p.type_id === OFFICE_TYPE_ID)

  let inStructure = false
  if (parentChain.length > 0) {
    const rootParent = parentChain[parentChain.length - 1]!
    const rootParentType = getType(rootParent.type_id)
    inStructure = rootParentType?.categoryId === CategoryIds.STRUCTURE
  }

  const isActiveShip = rootFlag === 'ActiveShip'
  const immediateParent = parentChain[0]
  const parentIsOwnedStructure = immediateParent != null && ownedStructureIds.has(immediateParent.item_id)
  const isOwnedStructure = ownedStructureIds.has(asset.item_id) ||
    (parentIsOwnedStructure && isFittedOrContentFlag(asset.location_flag))

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

export function buildStackKey(
  asset: ESIAsset,
  owner: Owner,
  rootLocationId: number,
  rootFlag: string,
  typeName: string
): string {
  return [
    owner.id,
    asset.type_id,
    rootLocationId,
    rootFlag,
    asset.is_blueprint_copy ?? false,
    typeName,
  ].join('-')
}

export function resolveAsset(
  asset: ESIAsset,
  owner: Owner,
  lookupMap: AssetLookupMap,
  context: ResolutionContext
): ResolvedAsset {
  const { itemIdToAsset } = lookupMap
  const { prices, assetNames, ownedStructureIds, starbaseMoonIds } = context

  const parentChain = buildParentChain(asset, itemIdToAsset)
  const rootFlag = getRootFlag(asset, parentChain)
  const rootLocation = resolveRootLocation(asset, parentChain, starbaseMoonIds)
  const modeFlags = computeModeFlags(asset, parentChain, rootFlag, ownedStructureIds)

  const sdeType = getType(asset.type_id)
  const customName = assetNames.get(asset.item_id)
  const rawTypeName = getTypeName(asset.type_id)
  const baseName = customName ? `${rawTypeName} (${customName})` : rawTypeName
  const isBlueprint = sdeType?.categoryId === RefCategoryIds.BLUEPRINT
  const isBpc = asset.is_blueprint_copy ?? false
  const typeName = isBlueprint ? formatBlueprintName(baseName, asset.item_id) : baseName

  const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
  const abyssalPrice = getAbyssalPrice(asset.item_id)
  const price = isBpc ? 0 : (abyssalPrice ?? prices.get(asset.type_id) ?? 0)

  const isAbyssal = isAbyssalTypeId(asset.type_id)
  const categoryName = isAbyssal ? 'Abyssals' : (sdeType?.categoryName ?? '')

  const stackKey = buildStackKey(asset, owner, rootLocation.rootLocationId, rootFlag, typeName)

  return {
    asset,
    owner,

    rootLocationId: rootLocation.rootLocationId,
    rootLocationType: rootLocation.rootLocationType,
    parentChain,
    rootFlag,

    locationName: rootLocation.locationName,
    systemId: rootLocation.systemId,
    systemName: rootLocation.systemName,
    regionId: rootLocation.regionId,
    regionName: rootLocation.regionName,

    typeId: asset.type_id,
    typeName,
    categoryId: sdeType?.categoryId ?? 0,
    categoryName,
    groupId: sdeType?.groupId ?? 0,
    groupName: sdeType?.groupName ?? '',
    volume,

    price,
    totalValue: price * asset.quantity,
    totalVolume: volume * asset.quantity,

    modeFlags,

    customName,
    isBlueprintCopy: isBpc,

    stackKey,
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
      if (type?.categoryId === CategoryIds.OWNER || type?.categoryId === CategoryIds.STATION) {
        continue
      }
      results.push(resolveAsset(asset, owner, lookupMap, context))
    }
  }

  return results
}
