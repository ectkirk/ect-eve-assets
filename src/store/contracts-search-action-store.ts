import { create } from 'zustand'

interface ContractsSearchAction {
  typeId: number
  typeName: string
}

interface ContractsSearchActionStore {
  pendingAction: ContractsSearchAction | null
  navigateToContracts: (typeId: number, typeName: string) => void
  clearAction: () => void
}

export const useContractsSearchActionStore = create<ContractsSearchActionStore>(
  (set) => ({
    pendingAction: null,
    navigateToContracts: (typeId, typeName) =>
      set({ pendingAction: { typeId, typeName } }),
    clearAction: () => set({ pendingAction: null }),
  })
)
