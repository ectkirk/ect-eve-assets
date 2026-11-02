import { create } from 'zustand'
import type {
  TotalValueConfig,
  MailFilterConfig,
  LoyaltyCorporationsConfig,
  OrderTypeFilterConfig,
  CharacterSortConfig,
  ContractAvailabilityFilterConfig,
} from '@/context/tab-controls-context'

interface ColumnConfig {
  id: string
  label: string
  visible: boolean
  toggle: () => void
}

interface ExpandCollapseConfig {
  isExpanded: boolean
  toggle: () => void
}

export interface SelectFilterConfig {
  id: string
  options: string[]
  value: string
  onChange: (value: string) => void
  /** i18n key (common) for the "all" option */
  allLabel: string
  /** i18n key (common) for the select's accessible name */
  ariaLabel: string
  hideWhenEmpty?: boolean
}

interface ProximityFilterConfig {
  systemId: number | null
  onChange: (systemId: number | null) => void
}

interface AssetTypeFilterConfig {
  value: string
  onChange: (value: string) => void
}

interface ResultCount {
  showing: number
  total: number
}

interface RefreshActionConfig {
  onRefresh: () => void
  isRefreshing: boolean
}

interface TabControlsState {
  columns: ColumnConfig[]
  expandCollapse: ExpandCollapseConfig | null
  search: string
  searchPlaceholder: string | null
  selectFilters: SelectFilterConfig[]
  proximityFilter: ProximityFilterConfig | null
  assetTypeFilter: AssetTypeFilterConfig | null
  resultCount: ResultCount | null
  totalValue: TotalValueConfig | null
  refreshAction: RefreshActionConfig | null
  mailFilter: MailFilterConfig | null
  loyaltyCorporations: LoyaltyCorporationsConfig | null
  orderTypeFilter: OrderTypeFilterConfig | null
  characterSort: CharacterSortConfig | null
  contractAvailabilityFilter: ContractAvailabilityFilterConfig | null
}

interface TabControlsActions {
  setColumns: (columns: ColumnConfig[]) => void
  setExpandCollapse: (config: ExpandCollapseConfig | null) => void
  setSearch: (value: string) => void
  setSearchPlaceholder: (placeholder: string | null) => void
  setSelectFilters: (filters: SelectFilterConfig[]) => void
  setProximityFilter: (config: ProximityFilterConfig | null) => void
  setAssetTypeFilter: (config: AssetTypeFilterConfig | null) => void
  setResultCount: (count: ResultCount | null) => void
  setTotalValue: (value: TotalValueConfig | null) => void
  setRefreshAction: (config: RefreshActionConfig | null) => void
  setMailFilter: (config: MailFilterConfig | null) => void
  setLoyaltyCorporations: (config: LoyaltyCorporationsConfig | null) => void
  setOrderTypeFilter: (config: OrderTypeFilterConfig | null) => void
  setCharacterSort: (config: CharacterSortConfig | null) => void
  setContractAvailabilityFilter: (
    config: ContractAvailabilityFilterConfig | null,
  ) => void
  resetSearch: () => void
}

export const useTabControlsStore = create<
  TabControlsState & TabControlsActions
>((set) => ({
  columns: [],
  expandCollapse: null,
  search: '',
  searchPlaceholder: null,
  selectFilters: [],
  proximityFilter: null,
  assetTypeFilter: null,
  resultCount: null,
  totalValue: null,
  refreshAction: null,
  mailFilter: null,
  loyaltyCorporations: null,
  orderTypeFilter: null,
  characterSort: null,
  contractAvailabilityFilter: null,

  setColumns: (columns) => {
    set({ columns })
  },
  setExpandCollapse: (expandCollapse) => {
    set({ expandCollapse })
  },
  setSearch: (search) => {
    set({ search })
  },
  setSearchPlaceholder: (searchPlaceholder) => {
    set({ searchPlaceholder })
  },
  setSelectFilters: (selectFilters) => {
    set({ selectFilters })
  },
  setProximityFilter: (proximityFilter) => {
    set({ proximityFilter })
  },
  setAssetTypeFilter: (assetTypeFilter) => {
    set({ assetTypeFilter })
  },
  setResultCount: (resultCount) => {
    set({ resultCount })
  },
  setTotalValue: (totalValue) => {
    set({ totalValue })
  },
  setRefreshAction: (refreshAction) => {
    set({ refreshAction })
  },
  setMailFilter: (mailFilter) => {
    set({ mailFilter })
  },
  setLoyaltyCorporations: (loyaltyCorporations) => {
    set({ loyaltyCorporations })
  },
  setOrderTypeFilter: (orderTypeFilter) => {
    set({ orderTypeFilter })
  },
  setCharacterSort: (characterSort) => {
    set({ characterSort })
  },
  setContractAvailabilityFilter: (contractAvailabilityFilter) => {
    set({ contractAvailabilityFilter })
  },
  resetSearch: () => {
    set({ search: '' })
  },
}))
