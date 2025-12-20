import type { ESIAsset } from '@/api/endpoints/assets'
import type { Owner } from '@/store/auth-store'

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

export interface ResolvedAsset {
  asset: ESIAsset
  owner: Owner

  rootLocationId: number
  rootLocationType: 'station' | 'structure' | 'solar_system'
  parentChain: ESIAsset[]
  rootFlag: string

  locationName: string
  systemId: number | undefined
  systemName: string
  regionId: number | undefined
  regionName: string

  typeId: number
  typeName: string
  categoryId: number
  categoryName: string
  groupId: number
  groupName: string
  volume: number

  price: number
  totalValue: number
  totalVolume: number

  modeFlags: AssetModeFlags

  customName: string | undefined
  isBlueprintCopy: boolean
}

export interface ResolvedAssetsByOwner {
  owner: Owner
  assets: ResolvedAsset[]
}

export function matchesAssetTypeFilter(modeFlags: AssetModeFlags, filterValue: string): boolean {
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
  const searchLower = search.toLowerCase()
  return (
    ra.typeName.toLowerCase().includes(searchLower) ||
    ra.groupName.toLowerCase().includes(searchLower) ||
    ra.locationName.toLowerCase().includes(searchLower) ||
    ra.systemName.toLowerCase().includes(searchLower) ||
    ra.regionName.toLowerCase().includes(searchLower)
  )
}
