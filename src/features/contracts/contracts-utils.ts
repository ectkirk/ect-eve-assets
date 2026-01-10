import { ArrowRightLeft, Gavel, Truck, HelpCircle } from 'lucide-react'
import type { ESIContract, ESIContractItem } from '@/api/endpoints/contracts'
import type { ContractWithItems } from '@/store/contracts-store'
import { hasType, getType, getTypeName } from '@/store/reference-cache'
import { getName } from '@/api/endpoints/universe'
import { usePriceStore } from '@/store/price-store'
import { getLocationName } from '@/lib/location-utils'
import { MS_PER_DAY, MS_PER_HOUR } from '@/lib/timer-utils'
import {
  isContractItemBpc,
  shouldValueBlueprintAtZero,
} from '@/lib/contract-items'

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

export interface TimeRemaining {
  days: number
  hours: number
  expired: boolean
}

export function getTimeRemaining(targetDate: string): TimeRemaining {
  const remaining = new Date(targetDate).getTime() - Date.now()
  if (remaining <= 0) return { days: 0, hours: 0, expired: true }
  const totalHours = Math.floor(remaining / MS_PER_HOUR)
  return {
    days: Math.floor(totalHours / 24),
    hours: totalHours % 24,
    expired: false,
  }
}

export function getCourierTimeRemaining(
  dateAccepted: string | undefined,
  daysToComplete: number | undefined
): TimeRemaining | null {
  if (!dateAccepted || !daysToComplete) return null
  const deadline = new Date(
    new Date(dateAccepted).getTime() + daysToComplete * MS_PER_DAY
  ).toISOString()
  return getTimeRemaining(deadline)
}

export function getDaysLeft(contract: ESIContract): number {
  if (contract.status === 'outstanding') {
    const time = getTimeRemaining(contract.date_expired)
    return time.expired ? 0 : time.days + (time.hours > 0 ? 1 : 0)
  }
  if (
    contract.status === 'in_progress' &&
    contract.date_accepted &&
    contract.days_to_complete
  ) {
    const time = getCourierTimeRemaining(
      contract.date_accepted,
      contract.days_to_complete
    )
    if (!time || time.expired) return 0
    return time.days + (time.hours > 0 ? 1 : 0)
  }
  return 0
}

const CONTRACT_TYPE_KEYS: Record<ESIContract['type'], string> = {
  unknown: 'types.unknown',
  item_exchange: 'types.itemExchange',
  auction: 'types.auction',
  courier: 'types.courier',
  loan: 'types.loan',
}

export function getContractTypeName(
  type: string,
  t: (key: string) => string
): string {
  const key = CONTRACT_TYPE_KEYS[type as ESIContract['type']]
  return key ? t(key) : type
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

export function getContractValue(contract: ESIContract): number {
  return (contract.price ?? 0) + (contract.reward ?? 0)
}

export function buildContractRow(
  contractWithItems: ContractWithItems,
  ownerType: 'character' | 'corporation',
  ownerId: number,
  isIssuer: boolean,
  t: (key: string, options?: Record<string, unknown>) => string
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
    getName(contract.issuer_id)?.name ??
    t('fallback.id', { id: contract.issuer_id })

  let assigneeName: string
  if (contract.acceptor_id) {
    assigneeName =
      getName(contract.acceptor_id)?.name ??
      t('fallback.id', { id: contract.acceptor_id })
  } else if (contract.availability === 'public') {
    assigneeName = t('availability.public')
  } else if (contract.assignee_id) {
    assigneeName =
      getName(contract.assignee_id)?.name ??
      t('fallback.id', { id: contract.assignee_id })
  } else {
    assigneeName = '-'
  }

  const priceStore = usePriceStore.getState()
  let itemValue = 0
  for (const item of includedItems) {
    const price = priceStore.getItemPrice(item.type_id, {
      itemId: item.item_id,
      isBlueprintCopy: shouldValueBlueprintAtZero(item, contract.availability),
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
    firstItemIsBlueprintCopy: firstItem
      ? isContractItemBpc(firstItem)
      : undefined,
    typeName: firstItem ? getTypeName(firstItem.type_id) : '',
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
