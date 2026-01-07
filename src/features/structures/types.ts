import type { Owner } from '@/store/auth-store'
import type { ESICorporationStructure } from '@/store/structures-store'
import type { ESIStarbase } from '@/store/starbases-store'
import type { TreeNode } from '@/lib/tree-types'

export interface UnifiedStructureRow {
  id: string
  kind: 'upwell' | 'pos'
  name: string
  owner: Owner
  typeId: number
  typeName: string
  regionName: string
  state: string
  fuelValue: number | null
  fuelText: string
  fuelIsLow: boolean
  rigs: string[]
  timerType: string
  timerText: string
  timerTimestamp: number | null
  timerIsUrgent: boolean
  isReinforced: boolean
  structure?: ESICorporationStructure
  starbase?: ESIStarbase
  treeNode?: TreeNode | null
}

export type StructureSortColumn =
  | 'name'
  | 'type'
  | 'region'
  | 'state'
  | 'fuel'
  | 'rigs'
  | 'details'
