import { useState, useCallback } from 'react'
import { getErrorMessage } from '@/lib/errors'
import type {
  ContractSearchFilters,
  SearchContract,
  CourierContract,
  SortPreset,
  CourierSortPreset,
  ContractTopItem,
} from './types'
import { filtersToApiParams, courierFiltersToApiParams } from './types'
import { PAGE_SIZE, mapToCourierContract } from './utils'
import { usePriceStore, isAbyssalTypeId } from '@/store/price-store'
import { hasBlueprintResearchData } from '@/lib/contract-items'
import { AT_SHIP_TYPE_IDS } from '@/lib/eve-constants'
import { createLRUCache, type LRUCache } from '@/lib/lru-cache'

interface CachedSearchResult<T> {
  contracts: T[]
  total?: number
  totalPages?: number
  nextCursor: string | null
  hasMore: boolean
}

const CACHE_TTL_MS = 2 * 60 * 1000
const CACHE_MAX_SIZE = 20

const buySellCache = createLRUCache<string, CachedSearchResult<SearchContract>>(
  CACHE_TTL_MS,
  CACHE_MAX_SIZE
)
const courierCache = createLRUCache<
  string,
  CachedSearchResult<CourierContract>
>(CACHE_TTL_MS, CACHE_MAX_SIZE)

export interface ResultsUpdate<T> {
  contracts: T[]
  total?: number
  totalPages?: number
  nextCursor?: string | null
  hasMore?: boolean
}

interface FetchCallbacks<T> {
  onResults: (update: ResultsUpdate<T>) => void
  onPage: (page: number) => void
}

interface FetchPageOptions<T> {
  pageNum: number
  params: ContractSearchParams
  cache: LRUCache<string, CachedSearchResult<T>>
  callbacks: FetchCallbacks<T>
  transform: (contracts: ContractSearchContract[]) => T[] | Promise<T[]>
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

async function fetchPage<T>({
  pageNum,
  params,
  cache,
  callbacks,
  transform,
  setLoading,
  setError,
}: FetchPageOptions<T>): Promise<void> {
  const cacheKey = JSON.stringify(params)
  const cached = cache.get(cacheKey)

  if (cached) {
    callbacks.onResults(cached)
    callbacks.onPage(pageNum)
    return
  }

  setLoading(true)
  setError(null)
  try {
    const response = await window.electronAPI!.refContractsSearch(params)

    if (response.error) {
      setError(response.error)
      callbacks.onResults({ contracts: [], total: 0, totalPages: 0 })
      return
    }

    if (!Array.isArray(response.contracts)) {
      setError('Invalid response from server')
      callbacks.onResults({ contracts: [], total: 0, totalPages: 0 })
      return
    }

    const contracts = await transform(response.contracts)

    const cacheEntry: CachedSearchResult<T> = {
      contracts,
      total: response.total,
      totalPages: response.totalPages,
      nextCursor: response.nextCursor ?? null,
      hasMore: response.hasMore ?? false,
    }

    cache.set(cacheKey, cacheEntry)
    callbacks.onResults(cacheEntry)
    callbacks.onPage(pageNum)
  } catch (err) {
    setError(getErrorMessage(err))
    callbacks.onResults({ contracts: [], total: 0, totalPages: 0 })
  } finally {
    setLoading(false)
  }
}

async function transformBuySellContracts(
  contracts: ContractSearchContract[],
  filters: ContractSearchFilters
): Promise<SearchContract[]> {
  const mapped = contracts
    .map((c) => {
      const items = c.items ?? []
      const requested = c.requestedItems ?? []
      const isWantToBuy = requested.length > 0
      return {
        ...c,
        topItems: items,
        requestedItems: requested,
        estValue: null as number | null,
        estRequestedValue: null as number | null,
        isWantToBuy,
      } as SearchContract
    })
    .filter((c) => {
      const ct = filters.contractType
      if (ct === 'want_to_sell')
        return c.type === 'item_exchange' && !c.isWantToBuy
      if (ct === 'want_to_buy')
        return c.type === 'item_exchange' && c.isWantToBuy
      if (ct === 'auction') return c.type === 'auction'
      return true
    })

  const allItems = mapped.flatMap((c) => [
    ...c.topItems,
    ...(c.requestedItems ?? []),
  ])
  const eligibleItems = allItems.filter(
    (item) =>
      !item.isBlueprintCopy &&
      (item.materialEfficiency ?? 0) === 0 &&
      (item.timeEfficiency ?? 0) === 0
  )
  const typeIds = [
    ...new Set(eligibleItems.map((item) => item.typeId).filter(Boolean)),
  ] as number[]
  const abyssalItemIds = eligibleItems
    .filter(
      (item) => item.itemId && item.typeId && isAbyssalTypeId(item.typeId)
    )
    .map((item) => item.itemId!)

  if (typeIds.length > 0 || abyssalItemIds.length > 0) {
    await usePriceStore.getState().ensureJitaPrices(typeIds, abyssalItemIds)
  }

  const priceStore = usePriceStore.getState()

  const calcItemsValue = (
    items: ContractTopItem[]
  ): { value: number; hasUnpriceable: boolean } => {
    let total = 0
    let hasUnpriceableATShip = false
    if (items.some(hasBlueprintResearchData)) {
      return { value: 0, hasUnpriceable: true }
    }

    for (const item of items) {
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
    return { value: total, hasUnpriceable: hasUnpriceableATShip }
  }

  for (const contract of mapped) {
    const included = calcItemsValue(contract.topItems)
    contract.estValue =
      included.value > 0 && !included.hasUnpriceable ? included.value : null

    if (contract.isWantToBuy && contract.requestedItems?.length) {
      const requested = calcItemsValue(contract.requestedItems)
      contract.estRequestedValue =
        requested.value > 0 && !requested.hasUnpriceable
          ? requested.value
          : null
    }
  }

  return mapped
}

export function useContractSearch() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBuySellPage = useCallback(
    async (
      pageNum: number,
      filters: ContractSearchFilters,
      sortPreset: SortPreset,
      callbacks: FetchCallbacks<SearchContract>,
      cursor?: string
    ) => {
      const pagination = cursor ? { cursor } : { page: pageNum }
      const params = filtersToApiParams(
        filters,
        sortPreset,
        pagination,
        PAGE_SIZE
      )

      await fetchPage({
        pageNum,
        params,
        cache: buySellCache,
        callbacks,
        transform: (contracts) => transformBuySellContracts(contracts, filters),
        setLoading: setIsLoading,
        setError,
      })
    },
    []
  )

  const fetchCourierPage = useCallback(
    async (
      pageNum: number,
      filters: ContractSearchFilters,
      sortPreset: CourierSortPreset,
      callbacks: FetchCallbacks<CourierContract>,
      cursor?: string
    ) => {
      const pagination = cursor ? { cursor } : { page: pageNum }
      const params = courierFiltersToApiParams(
        filters,
        sortPreset,
        pagination,
        PAGE_SIZE
      )

      await fetchPage({
        pageNum,
        params,
        cache: courierCache,
        callbacks,
        transform: (contracts) =>
          contracts
            .map(mapToCourierContract)
            .filter((c): c is CourierContract => c !== null),
        setLoading: setIsLoading,
        setError,
      })
    },
    []
  )

  return { isLoading, error, fetchBuySellPage, fetchCourierPage }
}
