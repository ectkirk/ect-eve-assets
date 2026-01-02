import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { logger } from '@/lib/logger'

interface InfoState<T> {
  info: T | null
  isLoading: boolean
  error: string | null
  lastFetch: number | null
  fetchInfo: () => Promise<void>
}

interface InfoStoreConfig<T> {
  name: string
  fetchFn: () => Promise<T & { error?: string }>
  cacheDurationMs?: number
}

const DEFAULT_CACHE_DURATION_MS = 60 * 60 * 1000

export function createInfoStore<T>(
  config: InfoStoreConfig<T>
): UseBoundStore<StoreApi<InfoState<T>>> {
  const { name, fetchFn, cacheDurationMs = DEFAULT_CACHE_DURATION_MS } = config

  return create<InfoState<T>>((set, get) => ({
    info: null,
    isLoading: false,
    error: null,
    lastFetch: null,

    fetchInfo: async () => {
      const { lastFetch, isLoading } = get()

      if (isLoading) return

      if (lastFetch && Date.now() - lastFetch < cacheDurationMs) {
        return
      }

      set({ isLoading: true, error: null })

      try {
        const result = await fetchFn()

        if (result.error) {
          logger.error(`Failed to fetch ${name} info`, undefined, {
            module: name,
            error: result.error,
          })
          set({ error: result.error, isLoading: false })
          return
        }

        set({ info: result, isLoading: false, lastFetch: Date.now() })
        logger.info(`${name} info loaded`, { module: name })
      } catch (err) {
        logger.error(`Failed to fetch ${name} info`, err, { module: name })
        set({ error: String(err), isLoading: false })
      }
    },
  }))
}
