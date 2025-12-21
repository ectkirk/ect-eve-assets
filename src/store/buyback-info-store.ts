import { create } from 'zustand'
import { logger } from '@/lib/logger'

interface BuybackInfoState {
  info: BuybackInfoResult | null
  isLoading: boolean
  error: string | null
  lastFetch: number | null
  fetchInfo: () => Promise<void>
}

const CACHE_DURATION_MS = 60 * 60 * 1000

export const useBuybackInfoStore = create<BuybackInfoState>((set, get) => ({
  info: null,
  isLoading: false,
  error: null,
  lastFetch: null,

  fetchInfo: async () => {
    const { lastFetch, isLoading } = get()

    if (isLoading) return

    if (lastFetch && Date.now() - lastFetch < CACHE_DURATION_MS) {
      return
    }

    set({ isLoading: true, error: null })

    try {
      const result = await window.electronAPI!.refBuybackInfo()

      if (result.error) {
        logger.error('Failed to fetch buyback info', undefined, {
          module: 'BuybackInfo',
          error: result.error,
        })
        set({ error: result.error, isLoading: false })
        return
      }

      set({ info: result, isLoading: false, lastFetch: Date.now() })
      logger.info('Buyback info loaded', { module: 'BuybackInfo' })
    } catch (err) {
      logger.error('Failed to fetch buyback info', err, {
        module: 'BuybackInfo',
      })
      set({ error: String(err), isLoading: false })
    }
  },
}))
