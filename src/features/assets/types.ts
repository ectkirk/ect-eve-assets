import type { VisibilityState } from '@tanstack/react-table'
import type {
  AssetModeFlags,
  ContractInfo,
  ResolvedAsset,
} from '@/lib/resolved-asset'
import { getAssetDisplayNames } from '@/lib/resolved-asset'
import { formatVolume as formatVolumeBase } from '@/lib/utils'

export const DISPLAY_FLAGS = {
  IN_CONTRACT: 'In Contract',
  SELL_ORDER: 'Sell Order',
  INDUSTRY_JOB: 'In Job',
  ACTIVE_SHIP: 'Active Ship',
} as const

export function getDisplayFlag(
  modeFlags: AssetModeFlags,
  locationFlag: string
): string {
  if (modeFlags.isContract) return DISPLAY_FLAGS.IN_CONTRACT
  if (modeFlags.isMarketOrder) return DISPLAY_FLAGS.SELL_ORDER
  if (modeFlags.isIndustryJob) return DISPLAY_FLAGS.INDUSTRY_JOB
  if (modeFlags.isActiveShip) return DISPLAY_FLAGS.ACTIVE_SHIP
  return locationFlag
}

export interface AssetRow {
  itemId: number
  typeId: number
  typeName: string
  quantity: number
  locationId: number
  resolvedLocationId: number
  systemId: number | undefined
  regionId: number | undefined
  locationName: string
  systemName: string
  regionName: string
  locationFlag: string
  isSingleton: boolean
  isBlueprintCopy: boolean
  isAbyssal: boolean
  price: number
  totalValue: number
  volume: number
  totalVolume: number
  categoryId: number
  categoryName: string
  groupName: string
  ownerId: number
  ownerName: string
  ownerType: 'character' | 'corporation'
  modeFlags: AssetModeFlags
  contractInfo?: ContractInfo
}

export function formatVolume(value: number): string {
  return formatVolumeBase(value, { suffix: true })
}

export const COLUMN_LABELS: Record<string, string> = {
  ownerName: 'columns.owner',
  quantity: 'columns.quantity',
  locationFlag: 'columns.flag',
  price: 'columns.price',
  totalValue: 'columns.value',
  totalVolume: 'columns.volume',
}

export const STORAGE_KEY_VISIBILITY = 'assets-column-visibility'

export const TOGGLEABLE_COLUMNS = new Set([
  'ownerName',
  'quantity',
  'locationFlag',
  'price',
  'totalValue',
  'totalVolume',
])

export const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  locationFlag: false,
  totalVolume: false,
}

export function loadColumnVisibility(): VisibilityState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_VISIBILITY)
    return stored ? JSON.parse(stored) : DEFAULT_COLUMN_VISIBILITY
  } catch {
    return DEFAULT_COLUMN_VISIBILITY
  }
}

export function saveColumnVisibility(state: VisibilityState): void {
  try {
    localStorage.setItem(STORAGE_KEY_VISIBILITY, JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }
}

export function createAssetRow(
  ra: ResolvedAsset,
  displayFlag: string,
  isAbyssal: boolean
): AssetRow {
  const names = getAssetDisplayNames(ra)
  return {
    itemId: ra.asset.item_id,
    typeId: ra.typeId,
    typeName: names.typeName,
    quantity: ra.asset.quantity,
    locationId: ra.asset.location_id,
    resolvedLocationId: ra.rootLocationId,
    systemId: ra.systemId,
    regionId: ra.regionId,
    locationName: names.locationName,
    systemName: names.systemName,
    regionName: names.regionName,
    locationFlag: displayFlag,
    isSingleton: ra.asset.is_singleton,
    isBlueprintCopy: ra.isBlueprintCopy,
    isAbyssal,
    price: ra.price,
    totalValue: ra.totalValue,
    volume: ra.volume,
    totalVolume: ra.totalVolume,
    categoryId: ra.categoryId,
    categoryName: names.categoryName,
    groupName: names.groupName,
    ownerId: ra.owner.id,
    ownerName: ra.owner.name,
    ownerType: ra.owner.type,
    modeFlags: ra.modeFlags,
    contractInfo: ra.contractInfo,
  }
}
