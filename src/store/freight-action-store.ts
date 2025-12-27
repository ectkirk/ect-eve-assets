import { create } from 'zustand'

export interface FreightAction {
  text: string
  nullSec: boolean
}

interface FreightActionStore {
  pendingAction: FreightAction | null
  triggerFreight: (action: FreightAction) => void
  clearAction: () => void
}

export const useFreightActionStore = create<FreightActionStore>((set) => ({
  pendingAction: null,
  triggerFreight: (action) => set({ pendingAction: action }),
  clearAction: () => set({ pendingAction: null }),
}))
