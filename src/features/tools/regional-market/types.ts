import type { CachedType } from '@/store/reference-cache'

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

export type TreeRow =
  | { kind: 'group'; node: MarketGroupNode }
  | { kind: 'item'; type: CachedType; depth: number; parentGroupId: number }
