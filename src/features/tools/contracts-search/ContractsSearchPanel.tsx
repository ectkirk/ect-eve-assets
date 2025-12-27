import { useState, useCallback, useRef } from 'react'
import { ContractsFilters } from './ContractsFilters'
import {
  ContractsResultsTable,
  SORT_PRESETS,
  type SortPreset,
} from './ContractsResultsTable'
import {
  ContractDetailModal,
  type DisplayContract,
} from './ContractDetailModal'
import { DEFAULT_FILTERS } from './types'
import type { ContractSearchFilters, SearchContract } from './types'
import { resolveNames } from '@/api/endpoints/universe'
import { usePriceStore } from '@/store/price-store'

const issuerNameCache = new Map<number, string>()

interface CachedResponse {
  contracts: SearchContract[]
  total: number
  totalPages: number
  timestamp: number
}

const RESPONSE_CACHE_TTL_MS = 2 * 60 * 1000
const responseCache = new Map<string, CachedResponse>()

function getResponseCacheKey(params: ContractSearchParams): string {
  return JSON.stringify(params)
}

function getCachedResponse(key: string): CachedResponse | null {
  const entry = responseCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > RESPONSE_CACHE_TTL_MS) {
    responseCache.delete(key)
    return null
  }
  return entry
}

function cacheResponse(
  key: string,
  contracts: SearchContract[],
  total: number,
  totalPages: number
): void {
  if (responseCache.size >= 20) {
    const oldest = [...responseCache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    )[0]
    if (oldest) responseCache.delete(oldest[0])
  }
  responseCache.set(key, {
    contracts,
    total,
    totalPages,
    timestamp: Date.now(),
  })
}

function toDisplayContract(sc: SearchContract): DisplayContract {
  const topItems = sc.topItems ?? []
  const topItemName =
    topItems.length > 1
      ? '[Multiple Items]'
      : (topItems[0]?.typeName ?? '[Empty]')

  return {
    contractId: sc.contractId,
    type: sc.type,
    title: sc.title,
    issuerName: sc.issuerName,
    locationName: sc.systemName,
    regionName: sc.regionName,
    systemName: sc.systemName,
    securityStatus: sc.securityStatus,
    dateIssued: sc.dateIssued,
    dateExpired: sc.dateExpired,
    price: sc.price,
    reward: sc.reward,
    collateral: sc.collateral,
    volume: sc.volume,
    availability: 'public',
    topItemName,
  }
}

const THE_FORGE_REGION_ID = 10000002
const PAGE_SIZE = 100

type ApiSortBy = 'price' | 'dateIssued' | 'dateExpired'
type ApiSortDirection = 'asc' | 'desc'

function presetToApiSort(preset: SortPreset): {
  sortBy: ApiSortBy
  sortDirection: ApiSortDirection
} {
  const [column, direction] = preset.split('-') as [string, ApiSortDirection]
  const sortBy: ApiSortBy =
    column === 'created'
      ? 'dateIssued'
      : column === 'timeLeft'
        ? 'dateExpired'
        : 'price'
  return { sortBy, sortDirection: direction }
}

function filtersToApiParams(
  filters: ContractSearchFilters,
  page: number,
  sortPreset: SortPreset
): ContractSearchParams {
  let regionId: number | null = null
  if (filters.locationSelection === 'the_forge') {
    regionId = THE_FORGE_REGION_ID
  } else if (filters.locationSelection === 'custom' && filters.regionId) {
    regionId = filters.regionId
  }

  const priceMin = filters.priceMin
    ? parseFloat(filters.priceMin) * 1_000_000
    : null
  const priceMax = filters.priceMax
    ? parseFloat(filters.priceMax) * 1_000_000
    : null

  const { sortBy, sortDirection } = presetToApiSort(sortPreset)

  return {
    mode: filters.mode,
    searchText: filters.exactTypeMatch
      ? undefined
      : filters.searchText || undefined,
    regionId,
    systemId: filters.systemId,
    contractType: filters.contractType,
    categoryId: filters.categoryId,
    groupId: filters.groupId,
    typeId: filters.typeId,
    excludeMultiple: filters.excludeMultiple,
    priceMin,
    priceMax,
    securityHigh: filters.securityHigh,
    securityLow: filters.securityLow,
    securityNull: filters.securityNull,
    issuer: filters.issuer || undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDirection,
  }
}

export function ContractsSearchPanel() {
  const [filters, setFilters] = useState<ContractSearchFilters>(DEFAULT_FILTERS)
  const [results, setResults] = useState<SearchContract[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [sortPreset, setSortPreset] = useState<SortPreset>('price-desc')
  const [selectedContract, setSelectedContract] =
    useState<SearchContract | null>(null)
  const lastFiltersRef = useRef<ContractSearchFilters>(filters)
  const lastSortRef = useRef<SortPreset>(sortPreset)

  const fetchPage = useCallback(
    async (
      pageNum: number,
      currentFilters: ContractSearchFilters,
      currentSort: SortPreset
    ) => {
      const params = filtersToApiParams(currentFilters, pageNum, currentSort)
      const cacheKey = getResponseCacheKey(params)
      const cached = getCachedResponse(cacheKey)

      if (cached) {
        setResults(cached.contracts)
        setTotal(cached.total)
        setTotalPages(cached.totalPages)
        setPage(pageNum)
        return
      }

      setIsLoading(true)
      setError(null)
      try {
        const response = await window.electronAPI!.refContractsSearch(params)

        if (response.error) {
          setError(response.error)
          setResults([])
          setTotal(0)
          setTotalPages(0)
          return
        }

        if (!Array.isArray(response.contracts)) {
          setError('Invalid response from server')
          setResults([])
          setTotal(0)
          setTotalPages(0)
          return
        }

        const contracts = response.contracts
        const uncachedIds = contracts
          .map((c) => c.issuerCharacterId)
          .filter((id) => !issuerNameCache.has(id))

        if (uncachedIds.length > 0) {
          const uniqueIds = [...new Set(uncachedIds)]
          const names = await resolveNames(uniqueIds)
          for (const [id, info] of names) {
            issuerNameCache.set(id, info.name)
          }
        }

        const contractsWithNames: SearchContract[] = contracts.map((c) => ({
          ...c,
          topItems: c.topItems ?? [],
          issuerId: c.issuerCharacterId,
          issuerName: issuerNameCache.get(c.issuerCharacterId) ?? '',
        }))

        const allItems = contractsWithNames.flatMap((c) => c.topItems)
        const typeIds = [...new Set(allItems.map((item) => item.typeId).filter(Boolean))] as number[]
        const abyssalItemIds = allItems
          .filter((item) => item.itemId)
          .map((item) => item.itemId!)

        if (typeIds.length > 0 || abyssalItemIds.length > 0) {
          await usePriceStore.getState().ensureJitaPrices(typeIds, abyssalItemIds)
        }

        const totalVal = response.total ?? 0
        const totalPagesVal = response.totalPages ?? 0

        cacheResponse(cacheKey, contractsWithNames, totalVal, totalPagesVal)
        setResults(contractsWithNames)
        setTotal(totalVal)
        setTotalPages(totalPagesVal)
        setPage(pageNum)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        setResults([])
        setTotal(0)
        setTotalPages(0)
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const handleSearch = useCallback(async () => {
    setHasSearched(true)
    lastFiltersRef.current = filters
    lastSortRef.current = sortPreset
    await fetchPage(1, filters, sortPreset)
  }, [filters, sortPreset, fetchPage])

  const handlePageChange = useCallback(
    (newPage: number) => {
      fetchPage(newPage, lastFiltersRef.current, lastSortRef.current)
    },
    [fetchPage]
  )

  const handleSortChange = useCallback(
    (newSort: SortPreset) => {
      setSortPreset(newSort)
      lastSortRef.current = newSort
      if (hasSearched) {
        fetchPage(1, lastFiltersRef.current, newSort)
      }
    },
    [hasSearched, fetchPage]
  )

  return (
    <div className="flex h-full">
      <ContractsFilters
        filters={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        isLoading={isLoading}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-medium text-content">
            {hasSearched
              ? total > results.length
                ? `Showing ${results.length} of ${total.toLocaleString()} contracts`
                : `${results.length} contract${results.length !== 1 ? 's' : ''} found`
              : 'Contract Search'}
          </h2>
          {hasSearched && results.length > 0 && (
            <select
              value={sortPreset}
              onChange={(e) => handleSortChange(e.target.value as SortPreset)}
              disabled={isLoading}
              className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-hidden disabled:opacity-50"
            >
              {SORT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center text-red-400">
            <p>{error}</p>
          </div>
        ) : hasSearched ? (
          <ContractsResultsTable
            contracts={results}
            mode={filters.mode}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={handlePageChange}
            onViewContract={setSelectedContract}
            isLoading={isLoading}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-content-muted">
            <p>Enter search criteria and click Search</p>
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
