import { create } from 'zustand'
import type {
  ContractSearchFilters,
  SearchContract,
  SortPreset,
} from '@/features/tools/contracts-search/types'
import { DEFAULT_FILTERS } from '@/features/tools/contracts-search/types'

const DEFAULT_SORT: SortPreset = 'price-desc'

interface ContractsSessionState {
  filters: ContractSearchFilters
  committedFilters: ContractSearchFilters
  committedSort: SortPreset
  results: SearchContract[]
  page: number
  totalPages: number
  total: number
  sortPreset: SortPreset
  hasSearched: boolean

  setFilters: (filters: ContractSearchFilters) => void
  commitSearch: () => void
  setResults: (
    results: SearchContract[],
    total: number,
    totalPages: number
  ) => void
  setPage: (page: number) => void
  setSortPreset: (preset: SortPreset) => void
  commitSort: () => void
  setHasSearched: (hasSearched: boolean) => void
  reset: () => void
}

export const useContractsSessionStore = create<ContractsSessionState>(
  (set) => ({
    filters: DEFAULT_FILTERS,
    committedFilters: DEFAULT_FILTERS,
    committedSort: DEFAULT_SORT,
    results: [],
    page: 1,
    totalPages: 0,
    total: 0,
    sortPreset: DEFAULT_SORT,
    hasSearched: false,

    setFilters: (filters) => set({ filters }),
    commitSearch: () =>
      set((state) => ({
        committedFilters: state.filters,
        committedSort: state.sortPreset,
      })),
    setResults: (results, total, totalPages) =>
      set({ results, total, totalPages }),
    setPage: (page) => set({ page }),
    setSortPreset: (sortPreset) => set({ sortPreset }),
    commitSort: () => set((state) => ({ committedSort: state.sortPreset })),
    setHasSearched: (hasSearched) => set({ hasSearched }),
    reset: () =>
      set({
        filters: DEFAULT_FILTERS,
        committedFilters: DEFAULT_FILTERS,
        committedSort: DEFAULT_SORT,
        results: [],
        page: 1,
        totalPages: 0,
        total: 0,
        sortPreset: DEFAULT_SORT,
        hasSearched: false,
      }),
  })
)
