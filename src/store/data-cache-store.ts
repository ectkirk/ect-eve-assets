import { create } from 'zustand'

export type DataType =
  | 'assets'
  | 'marketOrders'
  | 'industryJobs'
  | 'contracts'
  | 'clones'
  | 'blueprints'
  | 'skills'
  | 'prices'

interface CacheEntry {
  lastFetched: Date | null
  expiresAt: Date | null
  isFetching: boolean
  error: string | null
}

interface DataCacheState {
  cache: Record<DataType, CacheEntry>
  setFetching: (dataType: DataType, isFetching: boolean) => void
  setFetched: (dataType: DataType, expiresAt: Date | null) => void
  setError: (dataType: DataType, error: string | null) => void
  isUpdatable: (dataType: DataType) => boolean
  getTimeUntilUpdate: (dataType: DataType) => number | null
}

const defaultCacheEntry: CacheEntry = {
  lastFetched: null,
  expiresAt: null,
  isFetching: false,
  error: null,
}

const initialCache: Record<DataType, CacheEntry> = {
  assets: { ...defaultCacheEntry },
  marketOrders: { ...defaultCacheEntry },
  industryJobs: { ...defaultCacheEntry },
  contracts: { ...defaultCacheEntry },
  clones: { ...defaultCacheEntry },
  blueprints: { ...defaultCacheEntry },
  skills: { ...defaultCacheEntry },
  prices: { ...defaultCacheEntry },
}

export const useDataCacheStore = create<DataCacheState>((set, get) => ({
  cache: initialCache,

  setFetching: (dataType, isFetching) => {
    set((state) => ({
      cache: {
        ...state.cache,
        [dataType]: {
          ...state.cache[dataType],
          isFetching,
          error: isFetching ? null : state.cache[dataType].error,
        },
      },
    }))
  },

  setFetched: (dataType, expiresAt) => {
    set((state) => ({
      cache: {
        ...state.cache,
        [dataType]: {
          ...state.cache[dataType],
          lastFetched: new Date(),
          expiresAt,
          isFetching: false,
          error: null,
        },
      },
    }))
  },

  setError: (dataType, error) => {
    set((state) => ({
      cache: {
        ...state.cache,
        [dataType]: {
          ...state.cache[dataType],
          isFetching: false,
          error,
        },
      },
    }))
  },

  isUpdatable: (dataType) => {
    const entry = get().cache[dataType]
    if (entry.isFetching) return false
    if (!entry.expiresAt) return true
    return new Date() >= entry.expiresAt
  },

  getTimeUntilUpdate: (dataType) => {
    const entry = get().cache[dataType]
    if (!entry.expiresAt) return null
    const remaining = entry.expiresAt.getTime() - Date.now()
    return remaining > 0 ? remaining : 0
  },
}))
