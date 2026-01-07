import { ArrowRightLeft, Gavel, Truck, HelpCircle } from 'lucide-react'
import type { ESIContract, ESIContractItem } from '@/api/endpoints/contracts'
import type { ContractWithItems } from '@/store/contracts-store'
import { hasType, getType } from '@/store/reference-cache'
import { getName } from '@/api/endpoints/universe'
import { usePriceStore } from '@/store/price-store'
import { getLocationName } from '@/lib/location-utils'

function isContractItemBpc(item: ESIContractItem): boolean {
  return item.is_blueprint_copy === true || item.raw_quantity === -2
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type ContractSortColumn =
  | 'type'
  | 'items'
  | 'location'
  | 'assigner'
  | 'assignee'
  | 'price'
  | 'value'
  | 'volume'
  | 'collateral'
  | 'days'
  | 'expires'

export function getDaysLeft(contract: ESIContract): number {
  if (contract.status === 'outstanding') {
    const remaining = new Date(contract.date_expired).getTime() - Date.now()
    return Math.ceil(remaining / MS_PER_DAY)
  }
  if (
    contract.status === 'in_progress' &&
    contract.date_accepted &&
    contract.days_to_complete
  ) {
    const deadline =
      new Date(contract.date_accepted).getTime() +
      contract.days_to_complete * MS_PER_DAY
    return Math.ceil((deadline - Date.now()) / MS_PER_DAY)
  }
  return 0
}

export const CONTRACT_TYPE_NAMES: Record<ESIContract['type'], string> = {
  unknown: 'Unknown',
  item_exchange: 'Item Exchange',
  auction: 'Auction',
  courier: 'Courier',
  loan: 'Loan',
}

export const CONTRACT_TYPE_ICONS: Record<
  ESIContract['type'],
  React.ElementType
> = {
  unknown: HelpCircle,
  item_exchange: ArrowRightLeft,
  auction: Gavel,
  courier: Truck,
  loan: ArrowRightLeft,
}

export type ContractDirection = 'out' | 'in'

export interface ContractRow {
  contractWithItems: ContractWithItems
  items: ESIContractItem[]
  ownerType: 'character' | 'corporation'
  ownerId: number
  locationName: string
  endLocationName: string
  firstItemTypeId?: number
  firstItemCategoryId?: number
  firstItemIsBlueprintCopy?: boolean
  typeName: string
  direction: ContractDirection
  assignerName: string
  assigneeName: string
  itemValue: number
  status: ESIContract['status']
  isWantToBuy: boolean
  includedItemCount: number
  requestedItemCount: number
}

export function formatExpiry(dateExpired: string): {
  text: string
  isExpired: boolean
} {
  const remaining = new Date(dateExpired).getTime() - Date.now()

  if (remaining <= 0) {
    return { text: 'Expired', isExpired: true }
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  if (hours >= 24) {
    return { text: `${Math.floor(hours / 24)}d`, isExpired: false }
  }

  return { text: `${hours}h`, isExpired: false }
}

export function getContractValue(contract: ESIContract): number {
  return (contract.price ?? 0) + (contract.reward ?? 0)
}

export function buildContractRow(
  contractWithItems: ContractWithItems,
  ownerType: 'character' | 'corporation',
  ownerId: number,
  isIssuer: boolean
): ContractRow {
  const contract = contractWithItems.contract
  const items = contractWithItems.items ?? []
  const direction: ContractDirection = isIssuer ? 'out' : 'in'

  const includedItems = items.filter((item) => item.is_included)
  const requestedItems = items.filter((item) => !item.is_included)
  const isWantToBuy = includedItems.length === 0 && requestedItems.length > 0

  const displayItems = isWantToBuy ? requestedItems : includedItems
  const firstItem = displayItems[0]
  const firstItemType =
    firstItem && hasType(firstItem.type_id)
      ? getType(firstItem.type_id)
      : undefined

  const assignerName =
    getName(contract.issuer_id)?.name ?? `ID ${contract.issuer_id}`

  let assigneeName: string
  if (contract.availability === 'public') {
    assigneeName = 'Public'
  } else if (contract.assignee_id) {
    assigneeName =
      getName(contract.assignee_id)?.name ?? `ID ${contract.assignee_id}`
  } else {
    assigneeName = '-'
  }

  const priceStore = usePriceStore.getState()
  let itemValue = 0
  for (const item of includedItems) {
    const price = priceStore.getItemPrice(item.type_id, {
      itemId: item.item_id,
      isBlueprintCopy: isContractItemBpc(item),
    })
    itemValue += price * item.quantity
  }

  return {
    contractWithItems,
    items,
    ownerType,
    ownerId,
    locationName: getLocationName(contract.start_location_id),
    endLocationName: contract.end_location_id
      ? getLocationName(contract.end_location_id)
      : '',
    firstItemTypeId: firstItem?.type_id,
    firstItemCategoryId: firstItemType?.categoryId,
    firstItemIsBlueprintCopy: firstItem?.is_blueprint_copy,
    typeName:
      firstItemType?.name ??
      (firstItem ? `Unknown Type ${firstItem.type_id}` : ''),
    direction,
    assignerName,
    assigneeName,
    itemValue,
    status: contract.status,
    isWantToBuy,
    includedItemCount: includedItems.length,
    requestedItemCount: requestedItems.length,
  }
}
