import { useState, useCallback } from 'react'
import { getErrorMessage } from '@/lib/errors'
import { esi } from '@/api/esi'
import { usePriceStore } from '@/store/price-store'
import { isAbyssalTypeId } from '@/api/mutamarket-client'
import {
  type ContractItem,
  type ESIContractItemLike,
  resolveContractItems,
} from '@/lib/contract-items'
import { createLRUCache } from '@/lib/lru-cache'

export type { ContractItem }

interface ESIPublicContractItem extends ESIContractItemLike {
  is_singleton: boolean
  raw_quantity?: number
  record_id: number
}

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_SIZE = 100

const itemsCache = createLRUCache<number, ContractItem[]>(
  CACHE_TTL_MS,
  MAX_CACHE_SIZE
)

export function useContractItems() {
  const [items, setItems] = useState<ContractItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async (contractId: number) => {
    const cached = itemsCache.get(contractId)
    if (cached) {
      setItems(cached)
      return cached
    }

    setLoading(true)
    setError(null)

    try {
      const esiItems = await esi.fetch<ESIPublicContractItem[]>(
        `/contracts/public/items/${contractId}`,
        { requiresAuth: false }
      )

      const typeIds = [...new Set(esiItems.map((i) => i.type_id))]
      const abyssalItemIds = esiItems
        .filter((i) => i.item_id && isAbyssalTypeId(i.type_id))
        .map((i) => i.item_id!)

      await usePriceStore.getState().ensureJitaPrices(typeIds, abyssalItemIds)

      const resolved = resolveContractItems(esiItems)

      itemsCache.set(contractId, resolved)
      setItems(resolved)
      return resolved
    } catch (err) {
      setError(getErrorMessage(err))
      setItems(null)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setItems(null)
    setError(null)
    setLoading(false)
  }, [])

  return { items, loading, error, fetchItems, reset }
}
