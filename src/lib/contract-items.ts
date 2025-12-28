import { getType } from '@/store/reference-cache'
import { usePriceStore } from '@/store/price-store'

export interface ContractItem {
  typeId: number
  itemId?: number
  typeName: string
  groupName: string
  categoryId?: number
  categoryName: string
  quantity: number
  price: number
  isBlueprintCopy?: boolean
  materialEfficiency?: number
  timeEfficiency?: number
  runs?: number
  isIncluded?: boolean
}

export interface ESIContractItemLike {
  type_id: number
  quantity: number
  item_id?: number
  is_blueprint_copy?: boolean
  material_efficiency?: number
  time_efficiency?: number
  runs?: number
  is_included?: boolean
}

export function resolveContractItems(
  items: ESIContractItemLike[]
): ContractItem[] {
  const priceStore = usePriceStore.getState()

  const resolved = items.map((item) => {
    const typeInfo = getType(item.type_id)
    const result: ContractItem = {
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
    }
    if (item.is_included !== undefined) {
      result.isIncluded = item.is_included
    }
    return result
  })

  resolved.sort((a, b) => {
    const aValue = a.price * a.quantity
    const bValue = b.price * b.quantity
    return bValue - aValue
  })

  return resolved
}
