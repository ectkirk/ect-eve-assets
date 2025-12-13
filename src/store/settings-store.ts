import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  showContractItemsInAssets: boolean
  setShowContractItemsInAssets: (value: boolean) => void
  showMarketOrdersInAssets: boolean
  setShowMarketOrdersInAssets: (value: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showContractItemsInAssets: false,
      setShowContractItemsInAssets: (value) => set({ showContractItemsInAssets: value }),
      showMarketOrdersInAssets: false,
      setShowMarketOrdersInAssets: (value) => set({ showMarketOrdersInAssets: value }),
    }),
    { name: 'settings' }
  )
)
