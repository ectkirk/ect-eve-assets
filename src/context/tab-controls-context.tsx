import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from 'react'

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

interface CategoryFilterConfig {
  categories: string[]
  value: string
  onChange: (value: string) => void
}

interface AssetTypeFilterConfig {
  value: string
  onChange: (value: string) => void
}

interface ResultCount {
  showing: number
  total: number
}

export interface TotalValueConfig {
  value: number
  label?: string
  secondaryValue?: number
  secondaryLabel?: string
  tertiaryValue?: number
  tertiaryLabel?: string
}

interface RefreshActionConfig {
  onRefresh: () => void
  isRefreshing: boolean
}

export const MAIL_FILTER_OPTIONS = ['inbox', 'sent', 'all'] as const
export type MailFilterType = (typeof MAIL_FILTER_OPTIONS)[number]

export interface MailFilterConfig {
  value: MailFilterType
  onChange: (value: MailFilterType) => void
}

export interface LoyaltyCorporationsConfig {
  corporations: { id: number; name: string; total: number }[]
}

export const ORDER_TYPE_OPTIONS = ['all', 'sell', 'buy'] as const
export type OrderTypeValue = (typeof ORDER_TYPE_OPTIONS)[number]

export interface OrderTypeFilterConfig {
  value: OrderTypeValue
  onChange: (value: OrderTypeValue) => void
}

export type CharacterSortValue = 'name' | 'metric'

export interface CharacterSortConfig {
  options: { value: CharacterSortValue; label: string }[]
  value: CharacterSortValue
  onChange: (value: CharacterSortValue) => void
}

export interface ContractAvailabilityFilterConfig {
  hideAlliance: boolean
  onToggleAlliance: (value: boolean) => void
}

interface TabControlsContextValue {
  columns: ColumnConfig[]
  setColumns: (columns: ColumnConfig[]) => void
  expandCollapse: ExpandCollapseConfig | null
  setExpandCollapse: (config: ExpandCollapseConfig | null) => void
  search: string
  setSearch: (value: string) => void
  searchPlaceholder: string | null
  setSearchPlaceholder: (placeholder: string | null) => void
  categoryFilter: CategoryFilterConfig | null
  setCategoryFilter: (config: CategoryFilterConfig | null) => void
  assetTypeFilter: AssetTypeFilterConfig | null
  setAssetTypeFilter: (config: AssetTypeFilterConfig | null) => void
  resultCount: ResultCount | null
  setResultCount: (count: ResultCount | null) => void
  totalValue: TotalValueConfig | null
  setTotalValue: (value: TotalValueConfig | null) => void
  refreshAction: RefreshActionConfig | null
  setRefreshAction: (config: RefreshActionConfig | null) => void
  mailFilter: MailFilterConfig | null
  setMailFilter: (config: MailFilterConfig | null) => void
  loyaltyCorporations: LoyaltyCorporationsConfig | null
  setLoyaltyCorporations: (config: LoyaltyCorporationsConfig | null) => void
  orderTypeFilter: OrderTypeFilterConfig | null
  setOrderTypeFilter: (config: OrderTypeFilterConfig | null) => void
  characterSort: CharacterSortConfig | null
  setCharacterSort: (config: CharacterSortConfig | null) => void
  contractAvailabilityFilter: ContractAvailabilityFilterConfig | null
  setContractAvailabilityFilter: (
    config: ContractAvailabilityFilterConfig | null
  ) => void
}

const TabControlsContext = createContext<TabControlsContextValue | null>(null)

export function TabControlsProvider({ children }: { children: ReactNode }) {
  const [columns, setColumns] = useState<ColumnConfig[]>([])
  const [expandCollapse, setExpandCollapse] =
    useState<ExpandCollapseConfig | null>(null)
  const [search, setSearch] = useState('')
  const [searchPlaceholder, setSearchPlaceholder] = useState<string | null>(
    null
  )
  const [categoryFilter, setCategoryFilter] =
    useState<CategoryFilterConfig | null>(null)
  const [assetTypeFilter, setAssetTypeFilter] =
    useState<AssetTypeFilterConfig | null>(null)
  const [resultCount, setResultCount] = useState<ResultCount | null>(null)
  const [totalValue, setTotalValue] = useState<TotalValueConfig | null>(null)
  const [refreshAction, setRefreshAction] =
    useState<RefreshActionConfig | null>(null)
  const [mailFilter, setMailFilter] = useState<MailFilterConfig | null>(null)
  const [loyaltyCorporations, setLoyaltyCorporations] =
    useState<LoyaltyCorporationsConfig | null>(null)
  const [orderTypeFilter, setOrderTypeFilter] =
    useState<OrderTypeFilterConfig | null>(null)
  const [characterSort, setCharacterSort] =
    useState<CharacterSortConfig | null>(null)
  const [contractAvailabilityFilter, setContractAvailabilityFilter] =
    useState<ContractAvailabilityFilterConfig | null>(null)

  const value = useMemo(
    () => ({
      columns,
      setColumns,
      expandCollapse,
      setExpandCollapse,
      search,
      setSearch,
      searchPlaceholder,
      setSearchPlaceholder,
      categoryFilter,
      setCategoryFilter,
      assetTypeFilter,
      setAssetTypeFilter,
      resultCount,
      setResultCount,
      totalValue,
      setTotalValue,
      refreshAction,
      setRefreshAction,
      mailFilter,
      setMailFilter,
      loyaltyCorporations,
      setLoyaltyCorporations,
      orderTypeFilter,
      setOrderTypeFilter,
      characterSort,
      setCharacterSort,
      contractAvailabilityFilter,
      setContractAvailabilityFilter,
    }),
    [
      columns,
      expandCollapse,
      search,
      searchPlaceholder,
      categoryFilter,
      assetTypeFilter,
      resultCount,
      totalValue,
      refreshAction,
      mailFilter,
      loyaltyCorporations,
      orderTypeFilter,
      characterSort,
      contractAvailabilityFilter,
    ]
  )

  return (
    <TabControlsContext.Provider value={value}>
      {children}
    </TabControlsContext.Provider>
  )
}

export function useTabControls() {
  const ctx = useContext(TabControlsContext)
  if (!ctx)
    throw new Error('useTabControls must be used within TabControlsProvider')
  return ctx
}
