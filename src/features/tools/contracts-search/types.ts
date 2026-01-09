export type ContractSearchMode = 'buySell' | 'courier'

export type SortPreset =
  | 'created-asc'
  | 'created-desc'
  | 'timeLeft-asc'
  | 'timeLeft-desc'
  | 'price-asc'
  | 'price-desc'

export const SORT_PRESETS: { value: SortPreset; label: string }[] = [
  { value: 'created-asc', label: 'Date Created (Oldest First)' },
  { value: 'created-desc', label: 'Date Created (Newest First)' },
  { value: 'timeLeft-asc', label: 'Time Left (Shortest First)' },
  { value: 'timeLeft-desc', label: 'Time Left (Longest First)' },
  { value: 'price-asc', label: 'Price (Lowest First)' },
  { value: 'price-desc', label: 'Price (Highest First)' },
]

export type CourierSortPreset = 'created-desc' | 'created-asc'

export const COURIER_SORT_PRESETS: {
  value: CourierSortPreset
  label: string
}[] = [
  { value: 'created-desc', label: 'Newest First' },
  { value: 'created-asc', label: 'Oldest First' },
]

export type ContractType = 'want_to_sell' | 'want_to_buy' | 'auction'

export interface ContractSearchFilters {
  mode: ContractSearchMode
  searchText: string
  regionId: number | null
  contractType: ContractType
  categoryId: number | null
  groupId: number | null
  excludeMultiple: boolean
  exactTypeMatch: boolean
  typeId: number | null
  typeName: string | null
  priceMin: string
  priceMax: string
  securityHigh: boolean
  securityLow: boolean
  securityNull: boolean
}

export interface ContractTopItem {
  typeId?: number
  itemId?: number
  typeName: string
  quantity: number
  isBlueprintCopy?: boolean
  materialEfficiency?: number | null
  timeEfficiency?: number | null
  runs?: number | null
  isIncluded?: boolean
}

export interface SearchContract {
  contractId: number
  type: 'item_exchange' | 'auction' | 'courier'
  price: number
  buyout?: number
  collateral?: number
  volume?: number
  reward?: number
  regionName: string
  regionId: number
  systemName: string
  systemId: number
  securityStatus: number | null
  dateIssued: string
  dateExpired: string
  title: string
  topItems: ContractTopItem[]
  requestedItems?: ContractTopItem[]
  estValue: number | null
  estRequestedValue?: number | null
  isWantToBuy?: boolean
}

export interface CourierContract {
  contractId: number
  reward: number
  collateral: number
  volume: number
  daysToComplete: number
  originSystem: string
  originSystemId: number
  originRegion: string
  originRegionId: number
  originSecurity: number | null
  originStation?: string
  destSystem: string
  destSystemId: number | null
  destRegion: string
  destSecurity: number | null
  destStation?: string
  directJumps: number
  safeJumps: number | null
  dateIssued: string
  dateExpired: string
  title: string
}

export const DEFAULT_FILTERS: ContractSearchFilters = {
  mode: 'buySell',
  searchText: '',
  regionId: null,
  contractType: 'want_to_sell',
  categoryId: null,
  groupId: null,
  excludeMultiple: false,
  exactTypeMatch: false,
  typeId: null,
  typeName: null,
  priceMin: '',
  priceMax: '',
  securityHigh: true,
  securityLow: true,
  securityNull: true,
}

type ApiSortBy = 'price' | 'dateIssued' | 'dateExpired'
type ApiSortDirection = 'asc' | 'desc'

export function presetToApiSort(preset: SortPreset): {
  sortBy: ApiSortBy
  sortDirection: ApiSortDirection
} {
  const [column, direction] = preset.split('-') as [string, ApiSortDirection]
  const sortBy: ApiSortBy =
    column === 'created'
      ? 'dateIssued'
      : column === 'timeLeft'
        ? 'dateExpired'
        : 'price'
  return { sortBy, sortDirection: direction }
}

export function courierPresetToApiSort(preset: CourierSortPreset): {
  sortBy: ApiSortBy
  sortDirection: ApiSortDirection
} {
  return {
    sortBy: 'dateIssued',
    sortDirection: preset === 'created-desc' ? 'desc' : 'asc',
  }
}

export function filtersToApiParams(
  filters: ContractSearchFilters,
  sortPreset: SortPreset,
  pagination: { page: number } | { cursor: string },
  pageSize: number
): ContractSearchParams {
  const priceMin = filters.priceMin
    ? parseFloat(filters.priceMin) * 1_000_000
    : null
  const priceMax = filters.priceMax
    ? parseFloat(filters.priceMax) * 1_000_000
    : null

  const { sortBy, sortDirection } = presetToApiSort(sortPreset)

  const base = {
    mode: filters.mode,
    searchText: filters.exactTypeMatch
      ? undefined
      : filters.searchText || undefined,
    regionId: filters.regionId,
    contractType: filters.contractType,
    categoryId: filters.categoryId,
    groupId: filters.groupId,
    typeId: filters.typeId,
    excludeMultiple: filters.excludeMultiple,
    priceMin,
    priceMax,
    securityHigh: filters.securityHigh,
    securityLow: filters.securityLow,
    securityNull: filters.securityNull,
    pageSize,
    sortBy,
    sortDirection,
  }

  if ('cursor' in pagination) {
    return { ...base, cursor: pagination.cursor }
  }
  return { ...base, page: pagination.page }
}

export function courierFiltersToApiParams(
  filters: ContractSearchFilters,
  sortPreset: CourierSortPreset,
  pagination: { page: number } | { cursor: string },
  pageSize: number
): ContractSearchParams {
  const { sortBy, sortDirection } = courierPresetToApiSort(sortPreset)

  const base: ContractSearchParams = {
    mode: 'courier',
    regionId: filters.regionId,
    pageSize,
    sortBy,
    sortDirection,
  }

  if ('cursor' in pagination) {
    return { ...base, cursor: pagination.cursor }
  }
  return { ...base, page: pagination.page }
}
