import { create } from 'zustand'

const THE_FORGE_REGION_ID = 10000002

interface RegionalMarketSessionState {
  selectedRegionId: number
  selectedMarketGroupId: number | null
  selectedTypeId: number | null
  expandedGroupIds: Set<number>

  setSelectedRegionId: (id: number) => void
  setSelectedMarketGroupId: (id: number | null) => void
  setSelectedTypeId: (id: number | null) => void
  setExpandedGroupIds: (ids: Set<number>) => void
  toggleExpandedGroup: (id: number) => void
  expandGroups: (ids: number[]) => void
  reset: () => void
}

export const useRegionalMarketSessionStore = create<RegionalMarketSessionState>(
  (set) => ({
    selectedRegionId: THE_FORGE_REGION_ID,
    selectedMarketGroupId: null,
    selectedTypeId: null,
    expandedGroupIds: new Set(),

    setSelectedRegionId: (selectedRegionId) => set({ selectedRegionId }),
    setSelectedMarketGroupId: (selectedMarketGroupId) =>
      set({ selectedMarketGroupId }),
    setSelectedTypeId: (selectedTypeId) => set({ selectedTypeId }),
    setExpandedGroupIds: (expandedGroupIds) => set({ expandedGroupIds }),
    toggleExpandedGroup: (id) =>
      set((state) => {
        const next = new Set(state.expandedGroupIds)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return { expandedGroupIds: next }
      }),
    expandGroups: (ids) =>
      set((state) => {
        const next = new Set(state.expandedGroupIds)
        for (const id of ids) next.add(id)
        return { expandedGroupIds: next }
      }),
    reset: () =>
      set({
        selectedRegionId: THE_FORGE_REGION_ID,
        selectedMarketGroupId: null,
        selectedTypeId: null,
        expandedGroupIds: new Set(),
      }),
  })
)
