import type { VisibilityState } from '@tanstack/react-table'
import type { AssetModeFlags, ResolvedAsset } from '@/lib/resolved-asset'
import { getAssetDisplayNames } from '@/lib/resolved-asset'

export interface AssetRow {
  itemId: number
  typeId: number
  typeName: string
  quantity: number
  locationId: number
  resolvedLocationId: number
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
}

export function formatVolume(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' m³'
}

export const COLUMN_LABELS: Record<string, string> = {
  ownerName: 'Owner',
  quantity: 'Quantity',
  locationFlag: 'Flag',
  price: 'Price',
  totalValue: 'Value',
  totalVolume: 'Volume',
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
  }
}
