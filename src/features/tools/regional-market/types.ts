import type { ESIRegionOrder } from '@/api/endpoints/market'

export interface MarketGroup {
  id: number
  name: string
  parentGroupId: number | null
  hasTypes: boolean
  iconId: number | null
}

export interface MarketGroupNode {
  group: MarketGroup
  children: MarketGroupNode[]
  depth: number
}

export interface FlattenedGroupRow {
  node: MarketGroupNode
  isExpanded: boolean
}

export interface CachedOrders {
  sellOrders: ESIRegionOrder[]
  buyOrders: ESIRegionOrder[]
  fetchedAt: number
}

export const ORDER_CACHE_TTL_MS = 5 * 60 * 1000
