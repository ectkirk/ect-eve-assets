export type ContractSearchMode = 'buySell' | 'courier'

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
  exactMatch: boolean
  priceMin: string
  priceMax: string
  securityHigh: boolean
  securityLow: boolean
  securityNull: boolean
  issuer: string
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
  securityStatus: number
  dateIssued: string
  dateExpired: string
  title: string
  itemCount: number
  items?: SearchContractItem[]
}

export interface SearchContractItem {
  typeId: number
  typeName: string
  quantity: number
  isBlueprintCopy?: boolean
}

export interface ContractSearchRequest {
  filters: ContractSearchFilters
  page: number
  pageSize: number
}

export interface ContractSearchResponse {
  contracts: SearchContract[]
  total: number
  page: number
  pageSize: number
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
  exactMatch: false,
  priceMin: '',
  priceMax: '',
  securityHigh: true,
  securityLow: true,
  securityNull: true,
  issuer: '',
}
