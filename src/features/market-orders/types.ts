import type { MarketOrder } from '@/store/market-orders-store'
import type { ColumnConfig } from '@/hooks'

export const ORDER_COLUMNS: ColumnConfig[] = [
  { id: 'item', label: 'columns.item' },
  { id: 'type', label: 'columns.type' },
  { id: 'location', label: 'columns.location' },
  { id: 'price', label: 'columns.price' },
  { id: 'lowest', label: 'columns.best' },
  { id: 'diff', label: 'columns.diff' },
  { id: 'eveEstimated', label: 'columns.eveEst' },
  { id: 'quantity', label: 'columns.quantity' },
  { id: 'total', label: 'columns.total' },
  { id: 'expires', label: 'columns.exp' },
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
