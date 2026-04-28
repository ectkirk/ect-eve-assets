import { useShallow } from 'zustand/shallow'
import { useTabControlsStore } from '@/store/tab-controls-store'

export interface TotalValueConfig {
  value: number
  label?: string | undefined
  secondaryValue?: number | undefined
  secondaryLabel?: string | undefined
  tertiaryValue?: number | undefined
  tertiaryLabel?: string | undefined
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

/**
 * Compatibility shim — delegates to the Zustand store via useShallow
 * so each consumer only re-renders when fields it destructures change.
 */
export function useTabControls() {
  return useTabControlsStore(
    useShallow((s) => ({
      columns: s.columns,
      setColumns: s.setColumns,
      expandCollapse: s.expandCollapse,
      setExpandCollapse: s.setExpandCollapse,
      search: s.search,
      setSearch: s.setSearch,
      searchPlaceholder: s.searchPlaceholder,
      setSearchPlaceholder: s.setSearchPlaceholder,
      categoryFilter: s.categoryFilter,
      setCategoryFilter: s.setCategoryFilter,
      groupFilter: s.groupFilter,
      setGroupFilter: s.setGroupFilter,
      assetTypeFilter: s.assetTypeFilter,
      setAssetTypeFilter: s.setAssetTypeFilter,
      resultCount: s.resultCount,
      setResultCount: s.setResultCount,
      totalValue: s.totalValue,
      setTotalValue: s.setTotalValue,
      refreshAction: s.refreshAction,
      setRefreshAction: s.setRefreshAction,
      mailFilter: s.mailFilter,
      setMailFilter: s.setMailFilter,
      loyaltyCorporations: s.loyaltyCorporations,
      setLoyaltyCorporations: s.setLoyaltyCorporations,
      orderTypeFilter: s.orderTypeFilter,
      setOrderTypeFilter: s.setOrderTypeFilter,
      characterSort: s.characterSort,
      setCharacterSort: s.setCharacterSort,
      contractAvailabilityFilter: s.contractAvailabilityFilter,
      setContractAvailabilityFilter: s.setContractAvailabilityFilter,
    }))
  )
}

/**
 * @deprecated No longer needed — store is global. Kept as a passthrough for compatibility.
 */
export function TabControlsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
