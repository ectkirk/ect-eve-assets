import { create } from 'zustand'
import { useAssetStore } from './asset-store'
import { usePriceStore, isAbyssalTypeId } from './price-store'
import { fetchAbyssalPrices, type AbyssalItem } from '@/api/mutamarket-client'

interface SyncProgress {
  fetched: number
  total: number
}

interface SyncResult {
  success: number
  failed: number
}

interface AbyssalSyncState {
  isSyncing: boolean
  progress: SyncProgress | null
  lastResult: SyncResult | null
  unpricedCount: number

  refreshUnpricedCount: () => void
  startSync: () => Promise<void>
}

function collectUnpricedAbyssalItems(): AbyssalItem[] {
  const assetsByOwner = useAssetStore.getState().assetsByOwner
  const priceStore = usePriceStore.getState()
  const unpricedItems: AbyssalItem[] = []

  for (const { assets } of assetsByOwner) {
    for (const asset of assets) {
      if (isAbyssalTypeId(asset.type_id)) {
        const price = priceStore.getAbyssalPrice(asset.item_id)
        if (price === undefined || price === 0) {
          unpricedItems.push({ itemId: asset.item_id, typeId: asset.type_id })
        }
      }
    }
  }

  return unpricedItems
}

export const useAbyssalSyncStore = create<AbyssalSyncState>((set, get) => ({
  isSyncing: false,
  progress: null,
  lastResult: null,
  unpricedCount: 0,

  refreshUnpricedCount: () => {
    const items = collectUnpricedAbyssalItems()
    set({ unpricedCount: items.length, lastResult: null })
  },

  startSync: async () => {
    if (get().isSyncing) return

    const items = collectUnpricedAbyssalItems()
    if (items.length === 0) return

    set({
      isSyncing: true,
      progress: { fetched: 0, total: items.length },
      lastResult: null,
    })

    try {
      const results = await fetchAbyssalPrices(items, (fetched, total) => {
        set({ progress: { fetched, total } })
      })

      const successCount = results.size
      const failedCount = items.length - successCount

      set({ lastResult: { success: successCount, failed: failedCount } })
      get().refreshUnpricedCount()
    } finally {
      set({ isSyncing: false, progress: null })
    }
  },
}))
