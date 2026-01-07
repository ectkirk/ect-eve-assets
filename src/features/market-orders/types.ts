import type { MarketOrder } from '@/store/market-orders-store'
import type { ColumnConfig } from '@/hooks'

export const ORDER_COLUMNS: ColumnConfig[] = [
  { id: 'item', label: 'Item' },
  { id: 'type', label: 'Type' },
  { id: 'location', label: 'Location' },
  { id: 'price', label: 'Price' },
  { id: 'lowest', label: 'Best Order' },
  { id: 'diff', label: 'Difference' },
  { id: 'eveEstimated', label: 'EVE Estimated' },
  { id: 'quantity', label: 'Quantity' },
  { id: 'total', label: 'Total' },
  { id: 'expires', label: 'Expires' },
]

export interface OrderRow {
  order: MarketOrder
  ownerId: number
  ownerType: 'character' | 'corporation'
  ownerName: string
  typeId: number
  typeName: string
  categoryId?: number
  locationId: number
  locationName: string
  regionName: string
  systemName: string
  lowestSell: number | null
  highestBuy: number | null
  eveEstimated: number | null
  expiryTime: number
}

export type SortColumn =
  | 'item'
  | 'type'
  | 'price'
  | 'comparison'
  | 'diff'
  | 'eveEstimated'
  | 'qty'
  | 'total'
  | 'expires'
  | 'location'

export type DiffSortMode = 'number' | 'percent'
