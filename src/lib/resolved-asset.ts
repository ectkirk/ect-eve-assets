import type { ESIAsset } from '@/api/endpoints/assets'
import { matchesSearchLower } from './utils'
import type { Owner } from '@/store/auth-store'
import {
  getType,
  getLocation,
  getRegion,
  getLocationName,
  CategoryIds,
} from '@/store/reference-cache'
import { formatBlueprintName } from '@/store/blueprints-store'
import { isAbyssalTypeId } from '@/api/mutamarket-client'
import { i18n } from '@/i18n'

export interface AssetModeFlags {
  inHangar: boolean
  inShipHangar: boolean
  inItemHangar: boolean
  inDeliveries: boolean
  inAssetSafety: boolean
  inOffice: boolean
  inStructure: boolean
  isContract: boolean
  isMarketOrder: boolean
  isIndustryJob: boolean
  isOwnedStructure: boolean
  isActiveShip: boolean
}

export interface ContractInfo {
  contractId: number
  issuerId: number
  issuerCorporationId: number
}

export interface ResolvedAsset {
  asset: ESIAsset
  owner: Owner

  rootLocationId: number
  rootLocationType: 'station' | 'structure' | 'solar_system'
  parentChain: ESIAsset[]
  rootFlag: string
  hasOrphanedParent: boolean

  systemId: number | undefined
  regionId: number | undefined

  typeId: number
  categoryId: number
  groupId: number
  volume: number

  price: number
  totalValue: number
  totalVolume: number

  modeFlags: AssetModeFlags

  customName: string | undefined
  isBlueprintCopy: boolean

  contractInfo?: ContractInfo

  parentTypeId?: number
  parentTypeName?: string
  parentCustomName?: string
}

export interface AssetDisplayNames {
  typeName: string
  categoryName: string
  groupName: string
  locationName: string
  systemName: string
  regionName: string
}

export function getAssetDisplayNames(ra: ResolvedAsset): AssetDisplayNames {
  const type = getType(ra.typeId)
  const isAbyssal = isAbyssalTypeId(ra.typeId)

  let typeName =
    type?.name ?? i18n.t('assets:locations.unknownType', { id: ra.typeId })
  if (ra.customName) {
    typeName = `${typeName} (${ra.customName})`
  }
  if (ra.categoryId === CategoryIds.BLUEPRINT) {
    typeName = formatBlueprintName(typeName, ra.asset.item_id)
  }

  const systemLocation = ra.systemId ? getLocation(ra.systemId) : undefined

  let locationName: string
  if (ra.modeFlags.inAssetSafety) {
    locationName = i18n.t('assets:locations.assetSafety')
  } else if (ra.hasOrphanedParent) {
    locationName = i18n.t('assets:locations.unknownParent')
  } else {
    locationName = getLocationName(ra.rootLocationId)
  }

  return {
    typeName,
    categoryName: isAbyssal
      ? i18n.t('assets:categories.abyssals')
      : (type?.categoryName ?? ''),
    groupName: type?.groupName ?? '',
    locationName,
    systemName: systemLocation?.name ?? '',
    regionName: ra.regionId ? (getRegion(ra.regionId)?.name ?? '') : '',
  }
}

export interface ResolvedAssetsByOwner {
  owner: Owner
  assets: ResolvedAsset[]
}

export function matchesAssetTypeFilter(
  modeFlags: AssetModeFlags,
  filterValue: string
): boolean {
  if (!filterValue) return true
  switch (filterValue) {
    case 'ACTIVE_SHIP':
      return modeFlags.isActiveShip
    case 'CONTRACTS':
      return modeFlags.isContract
    case 'MARKET_ORDERS':
      return modeFlags.isMarketOrder
    case 'DELIVERIES':
      return modeFlags.inDeliveries
    case 'ASSET_SAFETY':
      return modeFlags.inAssetSafety
    case 'ITEM_HANGAR':
      return modeFlags.inItemHangar
    case 'SHIP_HANGAR':
      return modeFlags.inShipHangar
    case 'OFFICE':
      return modeFlags.inOffice
    case 'STRUCTURES':
      return modeFlags.isOwnedStructure
    case 'INDUSTRY_JOBS':
      return modeFlags.isIndustryJob
    default:
      return true
  }
}

export function matchesSearch(ra: ResolvedAsset, search: string): boolean {
  if (!search) return true
  const names = getAssetDisplayNames(ra)
  return matchesSearchLower(
    search.toLowerCase(),
    names.typeName,
    names.groupName,
    names.locationName,
    names.systemName,
    names.regionName
  )
}
