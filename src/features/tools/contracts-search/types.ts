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

export type ContractType =
  | 'want_to_sell'
  | 'want_to_buy'
  | 'auction'
  | 'exclude_want_to_buy'

export type LocationSelection = 'all' | 'the_forge' | 'custom'

export interface ContractSearchFilters {
  mode: ContractSearchMode
  searchText: string
  locationSelection: LocationSelection
  regionId: number | null
  systemId: number | null
  locationName: string | null
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
  issuer: string
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
  issuerName: string
  issuerId: number
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

export const DEFAULT_FILTERS: ContractSearchFilters = {
  mode: 'buySell',
  searchText: '',
  locationSelection: 'all',
  regionId: null,
  systemId: null,
  locationName: null,
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
  issuer: '',
}
