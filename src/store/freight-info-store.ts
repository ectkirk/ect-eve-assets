import { create } from 'zustand'
import { logger } from '@/lib/logger'

interface FreightInfoState {
  info: ShippingInfoResult | null
  isLoading: boolean
  error: string | null
  lastFetch: number | null
  fetchInfo: () => Promise<void>
}

const CACHE_DURATION_MS = 60 * 60 * 1000

export const useFreightInfoStore = create<FreightInfoState>((set, get) => ({
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
      const result = await window.electronAPI!.refShippingInfo()

      if (result.error) {
        logger.error('Failed to fetch freight info', undefined, {
          module: 'FreightInfo',
          error: result.error,
        })
        set({ error: result.error, isLoading: false })
        return
      }

      set({ info: result, isLoading: false, lastFetch: Date.now() })
      logger.info('Freight info loaded', { module: 'FreightInfo' })
    } catch (err) {
      logger.error('Failed to fetch freight info', err, {
        module: 'FreightInfo',
      })
      set({ error: String(err), isLoading: false })
    }
  },
}))
