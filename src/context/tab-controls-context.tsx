import { createContext, useContext, useState, type ReactNode } from 'react'

interface ColumnConfig {
  id: string
  label: string
  visible: boolean
  toggle: () => void
}

interface TabControlsContextValue {
  columns: ColumnConfig[]
  setColumns: (columns: ColumnConfig[]) => void
}

const TabControlsContext = createContext<TabControlsContextValue | null>(null)

export function TabControlsProvider({ children }: { children: ReactNode }) {
  const [columns, setColumns] = useState<ColumnConfig[]>([])

  return (
    <TabControlsContext.Provider value={{ columns, setColumns }}>
      {children}
    </TabControlsContext.Provider>
  )
}

export function useTabControls() {
  const ctx = useContext(TabControlsContext)
  if (!ctx) throw new Error('useTabControls must be used within TabControlsProvider')
  return ctx
}
