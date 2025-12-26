import { create } from 'zustand'

interface RegionalMarketAction {
  typeId: number
}

interface RegionalMarketActionStore {
  pendingAction: RegionalMarketAction | null
  navigateToType: (typeId: number) => void
  clearAction: () => void
}

export const useRegionalMarketActionStore = create<RegionalMarketActionStore>(
  (set) => ({
    pendingAction: null,
    navigateToType: (typeId) => set({ pendingAction: { typeId } }),
    clearAction: () => set({ pendingAction: null }),
  })
)
