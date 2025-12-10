import { createContext, useContext, useState, type ReactNode } from 'react'

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

interface ResultCount {
  showing: number
  total: number
}

interface TabControlsContextValue {
  columns: ColumnConfig[]
  setColumns: (columns: ColumnConfig[]) => void
  expandCollapse: ExpandCollapseConfig | null
  setExpandCollapse: (config: ExpandCollapseConfig | null) => void
  search: string
  setSearch: (value: string) => void
  categoryFilter: CategoryFilterConfig | null
  setCategoryFilter: (config: CategoryFilterConfig | null) => void
  resultCount: ResultCount | null
  setResultCount: (count: ResultCount | null) => void
}

const TabControlsContext = createContext<TabControlsContextValue | null>(null)

export function TabControlsProvider({ children }: { children: ReactNode }) {
  const [columns, setColumns] = useState<ColumnConfig[]>([])
  const [expandCollapse, setExpandCollapse] = useState<ExpandCollapseConfig | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterConfig | null>(null)
  const [resultCount, setResultCount] = useState<ResultCount | null>(null)

  return (
    <TabControlsContext.Provider value={{
      columns,
      setColumns,
      expandCollapse,
      setExpandCollapse,
      search,
      setSearch,
      categoryFilter,
      setCategoryFilter,
      resultCount,
      setResultCount,
    }}>
      {children}
    </TabControlsContext.Provider>
  )
}

export function useTabControls() {
  const ctx = useContext(TabControlsContext)
  if (!ctx) throw new Error('useTabControls must be used within TabControlsProvider')
  return ctx
}
