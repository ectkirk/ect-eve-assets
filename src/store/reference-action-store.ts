import { create } from 'zustand'

interface ReferenceAction {
  typeId: number
}

interface ReferenceActionStore {
  pendingAction: ReferenceAction | null
  navigateToType: (typeId: number) => void
  clearAction: () => void
}

export const useReferenceActionStore = create<ReferenceActionStore>((set) => ({
  pendingAction: null,
  navigateToType: (typeId) => set({ pendingAction: { typeId } }),
  clearAction: () => set({ pendingAction: null }),
}))
