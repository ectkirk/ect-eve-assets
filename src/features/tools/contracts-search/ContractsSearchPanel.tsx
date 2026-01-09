import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/shallow'
import { ContractsFilters } from './ContractsFilters'
import { ContractsResultsTable } from './ContractsResultsTable'
import { CourierResultsTable } from './CourierResultsTable'
import { ContractDetailModal } from './ContractDetailModal'
import type {
  SearchContract,
  CourierContract,
  SortPreset,
  CourierSortPreset,
} from './types'
import { DEFAULT_FILTERS } from './types'
import { useContractsSessionStore } from '@/store/contracts-session-store'
import { toDisplayContract } from './utils'
import { useContractSearch, type ResultsUpdate } from './useContractSearch'
import { formatFullNumber } from '@/lib/utils'

interface ContractsSearchPanelProps {
  initialType?: { typeId: number; typeName: string } | null
  onInitialTypeConsumed?: () => void
}

const SORT_PRESET_KEYS: { value: SortPreset; labelKey: string }[] = [
  { value: 'created-asc', labelKey: 'contractsSearch.sort.createdOldest' },
  { value: 'created-desc', labelKey: 'contractsSearch.sort.createdNewest' },
  { value: 'timeLeft-asc', labelKey: 'contractsSearch.sort.timeLeftShortest' },
  { value: 'timeLeft-desc', labelKey: 'contractsSearch.sort.timeLeftLongest' },
  { value: 'price-asc', labelKey: 'contractsSearch.sort.priceLowest' },
  { value: 'price-desc', labelKey: 'contractsSearch.sort.priceHighest' },
]

const COURIER_SORT_PRESET_KEYS: {
  value: CourierSortPreset
  labelKey: string
}[] = [
  { value: 'created-desc', labelKey: 'contractsSearch.sort.newestFirst' },
  { value: 'created-asc', labelKey: 'contractsSearch.sort.oldestFirst' },
]

export function ContractsSearchPanel({
  initialType,
  onInitialTypeConsumed,
}: ContractsSearchPanelProps) {
  const { t } = useTranslation('tools')
  const { filters, committedFilters, buySell, courier } =
    useContractsSessionStore(
      useShallow((s) => ({
        filters: s.filters,
        committedFilters: s.committedFilters,
        buySell: s.buySell,
        courier: s.courier,
      }))
    )

  const {
    setFilters: storeSetFilters,
    commitSearch,
    commitSort,
    setResults: storeSetResults,
    setCourierResults: storeSetCourierResults,
    setPage: storeSetPage,
    setSortPreset: storeSetSortPreset,
    setCourierSortPreset: storeSetCourierSortPreset,
    commitCourierSort,
    setHasSearched: storeSetHasSearched,
    setCourierPage: storeSetCourierPage,
    setCourierHasSearched: storeSetCourierHasSearched,
  } = useContractsSessionStore(
    useShallow((s) => ({
      setFilters: s.setFilters,
      commitSearch: s.commitSearch,
      commitSort: s.commitSort,
      setResults: s.setResults,
      setCourierResults: s.setCourierResults,
      setPage: s.setPage,
      setSortPreset: s.setSortPreset,
      setCourierSortPreset: s.setCourierSortPreset,
      commitCourierSort: s.commitCourierSort,
      setHasSearched: s.setHasSearched,
      setCourierPage: s.setCourierPage,
      setCourierHasSearched: s.setCourierHasSearched,
    }))
  )

  const [selectedContract, setSelectedContract] =
    useState<SearchContract | null>(null)

  const { isLoading, error, fetchBuySellPage, fetchCourierPage } =
    useContractSearch()

  const isCourier = filters.mode === 'courier'
  const currentState = isCourier ? courier : buySell
  const displayResults = isCourier ? courier.results : buySell.results

  const buySellCallbacks = useMemo(
    () => ({
      onResults: (update: ResultsUpdate<SearchContract>) =>
        storeSetResults(update),
      onPage: storeSetPage,
    }),
    [storeSetResults, storeSetPage]
  )

  const courierCallbacks = useMemo(
    () => ({
      onResults: (update: ResultsUpdate<CourierContract>) =>
        storeSetCourierResults(update),
      onPage: storeSetCourierPage,
    }),
    [storeSetCourierResults, storeSetCourierPage]
  )

  const lastHandledTypeId = useRef<number | null>(null)
  useEffect(() => {
    if (!initialType || isLoading) return
    if (lastHandledTypeId.current === initialType.typeId) return
    lastHandledTypeId.current = initialType.typeId

    const newFilters = {
      ...DEFAULT_FILTERS,
      exactTypeMatch: true,
      typeId: initialType.typeId,
      typeName: initialType.typeName,
      regionId: null,
    }
    storeSetFilters(newFilters)

    queueMicrotask(async () => {
      storeSetHasSearched(true)
      commitSearch()
      try {
        await fetchBuySellPage(
          1,
          newFilters,
          buySell.sortPreset,
          buySellCallbacks
        )
        onInitialTypeConsumed?.()
      } catch {
        lastHandledTypeId.current = null
      }
    })
  }, [
    initialType,
    isLoading,
    storeSetFilters,
    storeSetHasSearched,
    commitSearch,
    fetchBuySellPage,
    buySell.sortPreset,
    buySellCallbacks,
    onInitialTypeConsumed,
  ])

  const handleSearch = useCallback(async () => {
    if (filters.mode === 'courier') {
      storeSetCourierHasSearched(true)
      commitSearch()
      await fetchCourierPage(1, filters, courier.sortPreset, courierCallbacks)
    } else {
      storeSetHasSearched(true)
      commitSearch()
      await fetchBuySellPage(1, filters, buySell.sortPreset, buySellCallbacks)
    }
  }, [
    filters,
    buySell.sortPreset,
    courier.sortPreset,
    fetchBuySellPage,
    fetchCourierPage,
    buySellCallbacks,
    courierCallbacks,
    storeSetHasSearched,
    storeSetCourierHasSearched,
    commitSearch,
  ])

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (committedFilters.mode === 'courier') {
        const isNextPage = newPage === courier.page + 1
        const cursor =
          isNextPage && courier.nextCursor ? courier.nextCursor : undefined
        fetchCourierPage(
          newPage,
          committedFilters,
          courier.committedSort,
          courierCallbacks,
          cursor
        )
      } else {
        const isNextPage = newPage === buySell.page + 1
        const cursor =
          isNextPage && buySell.nextCursor ? buySell.nextCursor : undefined
        fetchBuySellPage(
          newPage,
          committedFilters,
          buySell.committedSort,
          buySellCallbacks,
          cursor
        )
      }
    },
    [
      fetchBuySellPage,
      fetchCourierPage,
      buySellCallbacks,
      courierCallbacks,
      committedFilters,
      buySell.committedSort,
      buySell.page,
      buySell.nextCursor,
      courier.committedSort,
      courier.page,
      courier.nextCursor,
    ]
  )

  const handleSortChange = useCallback(
    (newSort: SortPreset) => {
      storeSetSortPreset(newSort)
      if (buySell.hasSearched) {
        commitSort()
        fetchBuySellPage(1, committedFilters, newSort, buySellCallbacks)
      }
    },
    [
      buySell.hasSearched,
      fetchBuySellPage,
      buySellCallbacks,
      storeSetSortPreset,
      commitSort,
      committedFilters,
    ]
  )

  const handleCourierSortChange = useCallback(
    (newSort: CourierSortPreset) => {
      storeSetCourierSortPreset(newSort)
      if (courier.hasSearched) {
        commitCourierSort()
        fetchCourierPage(1, committedFilters, newSort, courierCallbacks)
      }
    },
    [
      courier.hasSearched,
      fetchCourierPage,
      courierCallbacks,
      storeSetCourierSortPreset,
      commitCourierSort,
      committedFilters,
    ]
  )

  return (
    <div className="flex h-full">
      <ContractsFilters
        filters={filters}
        onChange={storeSetFilters}
        onSearch={handleSearch}
        isLoading={isLoading}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-medium text-content">
            {currentState.hasSearched
              ? currentState.total > displayResults.length
                ? t('contractsSearch.showingOfContracts', {
                    count: displayResults.length,
                    total: formatFullNumber(currentState.total),
                  })
                : t('contractsSearch.contractsFound', {
                    count: displayResults.length,
                  })
              : t('contractsSearch.title')}
          </h2>
          {currentState.hasSearched &&
            displayResults.length > 0 &&
            (isCourier ? (
              <select
                value={courier.sortPreset}
                onChange={(e) =>
                  handleCourierSortChange(e.target.value as CourierSortPreset)
                }
                disabled={isLoading}
                aria-label="Sort courier contracts by"
                className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-hidden disabled:opacity-50"
              >
                {COURIER_SORT_PRESET_KEYS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {t(preset.labelKey)}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={buySell.sortPreset}
                onChange={(e) => handleSortChange(e.target.value as SortPreset)}
                disabled={isLoading}
                aria-label="Sort contracts by"
                className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-hidden disabled:opacity-50"
              >
                {SORT_PRESET_KEYS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {t(preset.labelKey)}
                  </option>
                ))}
              </select>
            ))}
        </div>
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center p-4 text-red-400">
            <p>{error}</p>
          </div>
        ) : currentState.hasSearched ? (
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            {isCourier ? (
              <CourierResultsTable
                contracts={courier.results}
                page={courier.page}
                totalPages={courier.totalPages}
                total={courier.total}
                onPageChange={handlePageChange}
                isLoading={isLoading}
              />
            ) : (
              <ContractsResultsTable
                contracts={buySell.results}
                page={buySell.page}
                totalPages={buySell.totalPages}
                total={buySell.total}
                onPageChange={handlePageChange}
                onViewContract={setSelectedContract}
                isLoading={isLoading}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-content-muted">
            <p>{t('contractsSearch.enterCriteria')}</p>
          </div>
        )}
      </div>

      {selectedContract && (
        <ContractDetailModal
          contract={toDisplayContract(selectedContract)}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </div>
  )
}
