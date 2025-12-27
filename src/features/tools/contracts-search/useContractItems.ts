import { useState, useCallback } from 'react'
import { esi } from '@/api/esi'
import { usePriceStore } from '@/store/price-store'
import { isAbyssalTypeId } from '@/api/mutamarket-client'
import { getType } from '@/store/reference-cache'
import { type ContractItem } from '@/lib/contract-items'

export type { ContractItem }

interface ESIContractItem {
  is_included: boolean
  is_singleton: boolean
  quantity: number
  raw_quantity?: number
  record_id: number
  type_id: number
  item_id?: number
  is_blueprint_copy?: boolean
  material_efficiency?: number
  time_efficiency?: number
  runs?: number
}

interface CacheEntry {
  items: ContractItem[]
  timestamp: number
}

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_SIZE = 100

const itemsCache = new Map<number, CacheEntry>()

function getCached(contractId: number): ContractItem[] | null {
  const entry = itemsCache.get(contractId)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    itemsCache.delete(contractId)
    return null
  }
  return entry.items
}

function setCache(contractId: number, items: ContractItem[]): void {
  if (itemsCache.size >= MAX_CACHE_SIZE) {
    const oldest = [...itemsCache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    )[0]
    if (oldest) itemsCache.delete(oldest[0])
  }
  itemsCache.set(contractId, { items, timestamp: Date.now() })
}

export function useContractItems() {
  const [items, setItems] = useState<ContractItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async (contractId: number) => {
    const cached = getCached(contractId)
    if (cached) {
      setItems(cached)
      return cached
    }

    setLoading(true)
    setError(null)

    try {
      const esiItems = await esi.fetch<ESIContractItem[]>(
        `/contracts/public/items/${contractId}/`,
        { requiresAuth: false }
      )

      const typeIds = [...new Set(esiItems.map((i) => i.type_id))]

      const abyssalItemIds = esiItems
        .filter((i) => i.item_id && isAbyssalTypeId(i.type_id))
        .map((i) => i.item_id!)

      const priceStore = usePriceStore.getState()
      await priceStore.ensureJitaPrices(typeIds, abyssalItemIds)
      const resolved: ContractItem[] = esiItems.map((item) => {
        const typeInfo = getType(item.type_id)
        return {
          typeId: item.type_id,
          itemId: item.item_id,
          typeName: typeInfo?.name ?? `Unknown (${item.type_id})`,
          groupName: typeInfo?.groupName ?? '',
          categoryId: typeInfo?.categoryId,
          categoryName: typeInfo?.categoryName ?? '',
          quantity: item.quantity || 1,
          price: priceStore.getItemPrice(item.type_id, {
            itemId: item.item_id,
            isBlueprintCopy: item.is_blueprint_copy,
          }),
          isBlueprintCopy: item.is_blueprint_copy,
          materialEfficiency: item.material_efficiency,
          timeEfficiency: item.time_efficiency,
          runs: item.runs,
          isIncluded: item.is_included,
        }
      })

      resolved.sort((a, b) => {
        const aPrice = a.price * a.quantity
        const bPrice = b.price * b.quantity
        return bPrice - aPrice
      })

      setCache(contractId, resolved)
      setItems(resolved)
      return resolved
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch items'
      setError(message)
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
