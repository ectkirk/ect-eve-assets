import { create } from 'zustand'
import type {
  ContractSearchFilters,
  SearchContract,
  CourierContract,
  SortPreset,
  CourierSortPreset,
} from '@/features/tools/contracts-search/types'
import { DEFAULT_FILTERS } from '@/features/tools/contracts-search/types'

const DEFAULT_SORT: SortPreset = 'price-desc'
const DEFAULT_COURIER_SORT: CourierSortPreset = 'created-desc'

interface BuySellState {
  results: SearchContract[]
  page: number
  totalPages: number
  total: number
  sortPreset: SortPreset
  committedSort: SortPreset
  hasSearched: boolean
  nextCursor: string | null
  hasMore: boolean
}

interface CourierState {
  results: CourierContract[]
  page: number
  totalPages: number
  total: number
  sortPreset: CourierSortPreset
  committedSort: CourierSortPreset
  hasSearched: boolean
  nextCursor: string | null
  hasMore: boolean
}

const DEFAULT_BUYSELL_STATE: BuySellState = {
  results: [],
  page: 1,
  totalPages: 0,
  total: 0,
  sortPreset: DEFAULT_SORT,
  committedSort: DEFAULT_SORT,
  hasSearched: false,
  nextCursor: null,
  hasMore: false,
}

const DEFAULT_COURIER_STATE: CourierState = {
  results: [],
  page: 1,
  totalPages: 0,
  total: 0,
  sortPreset: DEFAULT_COURIER_SORT,
  committedSort: DEFAULT_COURIER_SORT,
  hasSearched: false,
  nextCursor: null,
  hasMore: false,
}

interface ResultsUpdate {
  contracts: SearchContract[]
  total?: number
  totalPages?: number
  nextCursor?: string | null
  hasMore?: boolean
}

interface CourierResultsUpdate {
  contracts: CourierContract[]
  total?: number
  totalPages?: number
  nextCursor?: string | null
  hasMore?: boolean
}

interface ContractsSessionState {
  filters: ContractSearchFilters
  committedFilters: ContractSearchFilters
  buySell: BuySellState
  courier: CourierState

  setFilters: (filters: ContractSearchFilters) => void
  commitSearch: () => void
  setResults: (update: ResultsUpdate) => void
  setPage: (page: number) => void
  setSortPreset: (preset: SortPreset) => void
  commitSort: () => void
  setHasSearched: (hasSearched: boolean) => void
  setCourierResults: (update: CourierResultsUpdate) => void
  setCourierSortPreset: (preset: CourierSortPreset) => void
  commitCourierSort: () => void
  setCourierPage: (page: number) => void
  setCourierHasSearched: (hasSearched: boolean) => void
  reset: () => void
}

export const useContractsSessionStore = create<ContractsSessionState>(
  (set) => ({
    filters: DEFAULT_FILTERS,
    committedFilters: DEFAULT_FILTERS,
    buySell: DEFAULT_BUYSELL_STATE,
    courier: DEFAULT_COURIER_STATE,

    setFilters: (filters) => set({ filters }),
    commitSearch: () =>
      set((state) => ({
        committedFilters: state.filters,
        buySell: { ...state.buySell, committedSort: state.buySell.sortPreset },
        courier: { ...state.courier, committedSort: state.courier.sortPreset },
      })),
    setResults: (update) =>
      set((state) => ({
        buySell: {
          ...state.buySell,
          results: update.contracts,
          total: update.total ?? state.buySell.total,
          totalPages: update.totalPages ?? state.buySell.totalPages,
          nextCursor: update.nextCursor ?? null,
          hasMore: update.hasMore ?? false,
        },
      })),
    setPage: (page) =>
      set((state) => ({
        buySell: { ...state.buySell, page },
      })),
    setSortPreset: (sortPreset) =>
      set((state) => ({
        buySell: { ...state.buySell, sortPreset },
      })),
    commitSort: () =>
      set((state) => ({
        buySell: { ...state.buySell, committedSort: state.buySell.sortPreset },
      })),
    setHasSearched: (hasSearched) =>
      set((state) => ({
        buySell: { ...state.buySell, hasSearched },
      })),
    setCourierResults: (update) =>
      set((state) => ({
        courier: {
          ...state.courier,
          results: update.contracts,
          total: update.total ?? state.courier.total,
          totalPages: update.totalPages ?? state.courier.totalPages,
          nextCursor: update.nextCursor ?? null,
          hasMore: update.hasMore ?? false,
        },
      })),
    setCourierSortPreset: (sortPreset) =>
      set((state) => ({
        courier: { ...state.courier, sortPreset },
      })),
    commitCourierSort: () =>
      set((state) => ({
        courier: { ...state.courier, committedSort: state.courier.sortPreset },
      })),
    setCourierPage: (page) =>
      set((state) => ({
        courier: { ...state.courier, page },
      })),
    setCourierHasSearched: (hasSearched) =>
      set((state) => ({
        courier: { ...state.courier, hasSearched },
      })),
    reset: () =>
      set({
        filters: DEFAULT_FILTERS,
        committedFilters: DEFAULT_FILTERS,
        buySell: DEFAULT_BUYSELL_STATE,
        courier: DEFAULT_COURIER_STATE,
      }),
  })
)
