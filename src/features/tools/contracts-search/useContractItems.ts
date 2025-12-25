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
}

const itemsCache = new Map<number, ContractItem[]>()

export function useContractItems() {
  const [items, setItems] = useState<ContractItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async (contractId: number) => {
    if (itemsCache.has(contractId)) {
      setItems(itemsCache.get(contractId)!)
      return itemsCache.get(contractId)!
    }

    setLoading(true)
    setError(null)

    try {
      const esiItems = await esi.fetch<ESIContractItem[]>(
        `/contracts/public/items/${contractId}/`,
        { requiresAuth: false }
      )

      const includedItems = esiItems.filter((item) => item.is_included)
      const typeIds = [...new Set(includedItems.map((i) => i.type_id))]

      const abyssalItemIds = includedItems
        .filter((i) => i.item_id && isAbyssalTypeId(i.type_id))
        .map((i) => i.item_id!)

      const priceStore = usePriceStore.getState()
      await priceStore.ensureJitaPrices(typeIds, abyssalItemIds)
      const resolved: ContractItem[] = includedItems.map((item) => {
        const typeInfo = getType(item.type_id)
        return {
          typeId: item.type_id,
          itemId: item.item_id,
          typeName: typeInfo?.name ?? `Unknown (${item.type_id})`,
          groupName: typeInfo?.groupName ?? '',
          categoryName: typeInfo?.categoryName ?? '',
          quantity: item.quantity || 1,
          price: priceStore.getItemPrice(item.type_id, {
            itemId: item.item_id,
            isBlueprintCopy: item.is_blueprint_copy,
          }),
          isBlueprintCopy: item.is_blueprint_copy,
        }
      })

      resolved.sort((a, b) => {
        const aPrice = a.price * a.quantity
        const bPrice = b.price * b.quantity
        return bPrice - aPrice
      })

      itemsCache.set(contractId, resolved)
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
