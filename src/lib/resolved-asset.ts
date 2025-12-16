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

  stackKey: string
}

export interface ResolvedAssetsByOwner {
  owner: Owner
  assets: ResolvedAsset[]
}
