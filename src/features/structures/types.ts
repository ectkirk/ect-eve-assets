import type { Owner } from '@/store/auth-store'
import type { ESICorporationStructure } from '@/store/structures-store'
import type { ESIStarbase } from '@/store/starbases-store'
import type { TreeNode } from '@/lib/tree-types'

export interface StructureRow {
  kind: 'upwell'
  structure: ESICorporationStructure
  owner: Owner
  typeName: string
  regionName: string
  fuelDays: number | null
  treeNode: TreeNode | null
}

export interface StarbaseRow {
  kind: 'pos'
  starbase: ESIStarbase
  owner: Owner
  ownerName: string
  typeName: string
  systemName: string
  regionName: string
  moonName: string | null
  towerSize: number | undefined
  fuelTier: number | undefined
}

export type UpwellSortColumn =
  | 'name'
  | 'type'
  | 'region'
  | 'state'
  | 'fuel'
  | 'rigs'
  | 'details'
export type StarbaseSortColumn =
  | 'name'
  | 'type'
  | 'region'
  | 'state'
  | 'fuel'
  | 'details'
