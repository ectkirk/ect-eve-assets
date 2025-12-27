import { useState, useCallback } from 'react'
import { ContractsFilters } from './ContractsFilters'
import { ContractsResultsTable } from './ContractsResultsTable'
import {
  ContractDetailModal,
  type DisplayContract,
} from './ContractDetailModal'
import type { ContractSearchFilters, SearchContract, SortPreset } from './types'
import { SORT_PRESETS } from './types'
import { resolveNames } from '@/api/endpoints/universe'
import { usePriceStore, isAbyssalTypeId } from '@/store/price-store'
import { AT_SHIP_TYPE_IDS } from '@/lib/eve-constants'
import { useContractsSessionStore } from '@/store/contracts-session-store'
import { THE_FORGE_REGION_ID, PAGE_SIZE } from './utils'

const issuerNameCache = new Map<number, string>()

interface CachedResponse {
  contracts: SearchContract[]
  total: number
  totalPages: number
  nextCursor: string | null
  hasMore: boolean
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
  totalPages: number,
  nextCursor: string | null,
  hasMore: boolean
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
    nextCursor,
    hasMore,
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
  sortPreset: SortPreset,
  pagination: { page: number } | { cursor: string }
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

  const base = {
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
    pageSize: PAGE_SIZE,
    sortBy,
    sortDirection,
  }

  if ('cursor' in pagination) {
    return { ...base, cursor: pagination.cursor }
  }
  return { ...base, page: pagination.page }
}

export function ContractsSearchPanel() {
  const filters = useContractsSessionStore((s) => s.filters)
  const committedFilters = useContractsSessionStore((s) => s.committedFilters)
  const committedSort = useContractsSessionStore((s) => s.committedSort)
  const results = useContractsSessionStore((s) => s.results)
  const page = useContractsSessionStore((s) => s.page)
  const totalPages = useContractsSessionStore((s) => s.totalPages)
  const total = useContractsSessionStore((s) => s.total)
  const sortPreset = useContractsSessionStore((s) => s.sortPreset)
  const hasSearched = useContractsSessionStore((s) => s.hasSearched)
  const nextCursor = useContractsSessionStore((s) => s.nextCursor)
  const storeSetFilters = useContractsSessionStore((s) => s.setFilters)
  const commitSearch = useContractsSessionStore((s) => s.commitSearch)
  const commitSort = useContractsSessionStore((s) => s.commitSort)
  const storeSetResults = useContractsSessionStore((s) => s.setResults)
  const storeSetPage = useContractsSessionStore((s) => s.setPage)
  const storeSetSortPreset = useContractsSessionStore((s) => s.setSortPreset)
  const storeSetHasSearched = useContractsSessionStore((s) => s.setHasSearched)

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedContract, setSelectedContract] =
    useState<SearchContract | null>(null)

  const fetchPage = useCallback(
    async (
      pageNum: number,
      currentFilters: ContractSearchFilters,
      currentSort: SortPreset,
      cursor?: string
    ) => {
      const pagination = cursor ? { cursor } : { page: pageNum }
      const params = filtersToApiParams(currentFilters, currentSort, pagination)
      const cacheKey = getResponseCacheKey(params)
      const cached = getCachedResponse(cacheKey)

      if (cached) {
        storeSetResults({
          contracts: cached.contracts,
          total: cached.total || undefined,
          totalPages: cached.totalPages || undefined,
          nextCursor: cached.nextCursor,
          hasMore: cached.hasMore,
        })
        storeSetPage(pageNum)
        return
      }

      setIsLoading(true)
      setError(null)
      try {
        const response = await window.electronAPI!.refContractsSearch(params)

        if (response.error) {
          setError(response.error)
          storeSetResults({ contracts: [], total: 0, totalPages: 0 })
          return
        }

        if (!Array.isArray(response.contracts)) {
          setError('Invalid response from server')
          storeSetResults({ contracts: [], total: 0, totalPages: 0 })
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

        const contractsWithNames: SearchContract[] = contracts.map((c) => {
          const items = c.items ?? []
          return {
            ...c,
            topItems: items,
            issuerId: c.issuerCharacterId,
            issuerName: issuerNameCache.get(c.issuerCharacterId) ?? '',
            estValue: null,
          }
        })

        const eligibleItems = contractsWithNames
          .filter(
            (c) =>
              !c.topItems.some(
                (item) =>
                  item.isBlueprintCopy ||
                  (item.materialEfficiency ?? 0) > 0 ||
                  (item.timeEfficiency ?? 0) > 0
              )
          )
          .flatMap((c) => c.topItems)
        const typeIds = [
          ...new Set(eligibleItems.map((item) => item.typeId).filter(Boolean)),
        ] as number[]
        const abyssalItemIds = eligibleItems
          .filter(
            (item) => item.itemId && item.typeId && isAbyssalTypeId(item.typeId)
          )
          .map((item) => item.itemId!)

        if (typeIds.length > 0 || abyssalItemIds.length > 0) {
          await usePriceStore
            .getState()
            .ensureJitaPrices(typeIds, abyssalItemIds)
        }

        const priceStore = usePriceStore.getState()
        for (const contract of contractsWithNames) {
          const hasBlueprint = contract.topItems.some(
            (item) =>
              item.isBlueprintCopy === true ||
              (item.materialEfficiency ?? 0) > 0 ||
              (item.timeEfficiency ?? 0) > 0
          )
          if (hasBlueprint) continue

          let total = 0
          let hasUnpriceableATShip = false
          for (const item of contract.topItems) {
            if (!item.typeId) continue
            const price = priceStore.getItemPrice(item.typeId, {
              itemId: item.itemId,
              isBlueprintCopy: item.isBlueprintCopy,
            })
            if (price === 0 && AT_SHIP_TYPE_IDS.has(item.typeId)) {
              hasUnpriceableATShip = true
            }
            total += price * item.quantity
          }
          contract.estValue = total > 0 && !hasUnpriceableATShip ? total : null
        }

        const update = {
          contracts: contractsWithNames,
          total: response.total,
          totalPages: response.totalPages,
          nextCursor: response.nextCursor ?? null,
          hasMore: response.hasMore ?? false,
        }

        cacheResponse(
          cacheKey,
          contractsWithNames,
          response.total ?? 0,
          response.totalPages ?? 0,
          update.nextCursor,
          update.hasMore
        )
        storeSetResults(update)
        storeSetPage(pageNum)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        storeSetResults({ contracts: [], total: 0, totalPages: 0 })
      } finally {
        setIsLoading(false)
      }
    },
    [storeSetResults, storeSetPage]
  )

  const handleSearch = useCallback(async () => {
    storeSetHasSearched(true)
    commitSearch()
    await fetchPage(1, filters, sortPreset)
  }, [filters, sortPreset, fetchPage, storeSetHasSearched, commitSearch])

  const handlePageChange = useCallback(
    (newPage: number) => {
      const isNextPage = newPage === page + 1
      const cursor = isNextPage && nextCursor ? nextCursor : undefined
      fetchPage(newPage, committedFilters, committedSort, cursor)
    },
    [fetchPage, committedFilters, committedSort, page, nextCursor]
  )

  const handleSortChange = useCallback(
    (newSort: SortPreset) => {
      storeSetSortPreset(newSort)
      if (hasSearched) {
        commitSort()
        fetchPage(1, committedFilters, newSort)
      }
    },
    [hasSearched, fetchPage, storeSetSortPreset, commitSort, committedFilters]
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
          <div className="flex flex-1 flex-col items-center justify-center p-4 text-red-400">
            <p>{error}</p>
          </div>
        ) : hasSearched ? (
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            <ContractsResultsTable
              contracts={results}
              mode={committedFilters.mode}
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={handlePageChange}
              onViewContract={setSelectedContract}
              isLoading={isLoading}
            />
          </div>
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
