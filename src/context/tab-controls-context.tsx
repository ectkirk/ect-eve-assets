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

interface TabControlsContextValue {
  columns: ColumnConfig[]
  setColumns: (columns: ColumnConfig[]) => void
  expandCollapse: ExpandCollapseConfig | null
  setExpandCollapse: (config: ExpandCollapseConfig | null) => void
  search: string
  setSearch: (value: string) => void
  categoryFilter: CategoryFilterConfig | null
  setCategoryFilter: (config: CategoryFilterConfig | null) => void
}

const TabControlsContext = createContext<TabControlsContextValue | null>(null)

export function TabControlsProvider({ children }: { children: ReactNode }) {
  const [columns, setColumns] = useState<ColumnConfig[]>([])
  const [expandCollapse, setExpandCollapse] = useState<ExpandCollapseConfig | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterConfig | null>(null)

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
