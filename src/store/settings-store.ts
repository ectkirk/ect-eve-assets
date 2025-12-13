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
      showContractItemsInAssets: true,
      setShowContractItemsInAssets: (value) => set({ showContractItemsInAssets: value }),
      showMarketOrdersInAssets: true,
      setShowMarketOrdersInAssets: (value) => set({ showMarketOrdersInAssets: value }),
    }),
    { name: 'settings' }
  )
)
