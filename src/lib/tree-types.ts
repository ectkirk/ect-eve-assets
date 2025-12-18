import type { ESIAsset } from '@/api/endpoints/assets'

export enum TreeMode {
  ALL = 'ALL',
  ITEM_HANGAR = 'ITEM_HANGAR',
  SHIP_HANGAR = 'SHIP_HANGAR',
  DELIVERIES = 'DELIVERIES',
  ASSET_SAFETY = 'ASSET_SAFETY',
  MARKET_ORDERS = 'MARKET_ORDERS',
  INDUSTRY_JOBS = 'INDUSTRY_JOBS',
  CLONES = 'CLONES',
  OFFICE = 'OFFICE',
  STRUCTURES = 'STRUCTURES',
  CONTRACTS = 'CONTRACTS',
}

export type TreeNodeType =
  | 'region'
  | 'system'
  | 'station'
  | 'office'
  | 'division'
  | 'container'
  | 'ship'
  | 'item'
  | 'stack'

export interface TreeNode {
  id: string
  nodeType: TreeNodeType
  name: string
  depth: number
  children: TreeNode[]

  // Asset data (only for item/container/ship nodes)
  asset?: ESIAsset
  typeId?: number
  typeName?: string
  categoryId?: number
  categoryName?: string
  groupName?: string

  // Location hierarchy (for location nodes)
  locationId?: number
  regionId?: number
  regionName?: string
  systemId?: number
  systemName?: string

  // Aggregated totals (sum of self + children)
  totalCount: number
  totalValue: number
  totalVolume: number

  // For stacked items
  stackedAssets?: ESIAsset[]
  quantity?: number

  // Owner info
  ownerId?: number
  ownerName?: string
  ownerType?: 'character' | 'corporation'

  // Blueprint info
  isBlueprintCopy?: boolean

  // Division info (for division nodes)
  divisionNumber?: number

  // Price info (for leaf items)
  price?: number

  // Source flags for color coding
  isInContract?: boolean
  isInMarketOrder?: boolean
  isInIndustryJob?: boolean
  isOwnedStructure?: boolean
  isActiveShip?: boolean
}

export interface TreeState {
  expandedNodes: Set<string>
  mode: TreeMode
}

export const LocationFlagNumbers = {
  Hangar: 4,
  Cargo: 5,
  CorpSAG1: 116,
  CorpSAG2: 117,
  CorpSAG3: 118,
  CorpSAG4: 119,
  CorpSAG5: 120,
  CorpSAG6: 121,
  CorpSAG7: 122,
  ShipHangar: 90,
  FleetHangar: 155,
  FighterBay: 158,
  FighterTube0: 159,
  FighterTube1: 160,
  FighterTube2: 161,
  FighterTube3: 162,
  FighterTube4: 163,
  Deliveries: 173,
  CorpDeliveries: 62,
  AssetSafety: 36,
  CloneBay: 89,
  StructureFuel: 164,
  StructureServiceSlot0: 165,
  StructureServiceSlot1: 166,
  StructureServiceSlot2: 167,
  StructureServiceSlot3: 168,
  StructureServiceSlot4: 169,
  StructureServiceSlot5: 170,
  StructureServiceSlot6: 171,
  StructureServiceSlot7: 172,
} as const

export const LocationFlagToNumber: Record<string, number> = {
  Hangar: 4,
  Cargo: 5,
  CorpSAG1: 116,
  CorpSAG2: 117,
  CorpSAG3: 118,
  CorpSAG4: 119,
  CorpSAG5: 120,
  CorpSAG6: 121,
  CorpSAG7: 122,
  ShipHangar: 90,
  FleetHangar: 155,
  FighterBay: 158,
  FighterTube0: 159,
  FighterTube1: 160,
  FighterTube2: 161,
  FighterTube3: 162,
  FighterTube4: 163,
  Deliveries: 173,
  CorpDeliveries: 62,
  AssetSafety: 36,
  CloneBay: 89,
}

export const CategoryIds = {
  OWNER: 1,
  STATION: 3,
  SHIP: 6,
  MODULE: 7,
  CHARGE: 8,
  BLUEPRINT: 9,
  SKILL: 16,
  DRONE: 18,
  IMPLANT: 20,
  STARBASE: 23,
  STRUCTURE: 65,
  STRUCTURE_MODULE: 66,
  SKIN: 91,
} as const

// Flags that represent items directly in hangars (flag 4 or corp SAG divisions)
export const HANGAR_FLAGS = new Set([
  'Hangar',
  'CorpSAG1',
  'CorpSAG2',
  'CorpSAG3',
  'CorpSAG4',
  'CorpSAG5',
  'CorpSAG6',
  'CorpSAG7',
])

// Flags that represent items inside ships/containers (nested items)
export const SHIP_CONTENT_FLAGS = new Set([
  'AutoFit',
  'Cargo',
  'DroneBay',
  'ShipHangar',
  'FleetHangar',
  'FighterBay',
  'FighterTube0',
  'FighterTube1',
  'FighterTube2',
  'FighterTube3',
  'FighterTube4',
  'SpecializedFuelBay',
  'SpecializedOreHold',
  'SpecializedGasHold',
  'SpecializedMineralHold',
  'SpecializedSalvageHold',
  'SpecializedShipHold',
  'SpecializedSmallShipHold',
  'SpecializedMediumShipHold',
  'SpecializedLargeShipHold',
  'SpecializedIndustrialShipHold',
  'SpecializedAmmoHold',
  'SpecializedCommandCenterHold',
  'SpecializedPlanetaryCommoditiesHold',
  'SpecializedMaterialBay',
  'Locked',
  'Unlocked',
  'SubSystemSlot0',
  'SubSystemSlot1',
  'SubSystemSlot2',
  'SubSystemSlot3',
  'SubSystemSlot4',
  'SubSystemSlot5',
  'SubSystemSlot6',
  'SubSystemSlot7',
  'LoSlot0',
  'LoSlot1',
  'LoSlot2',
  'LoSlot3',
  'LoSlot4',
  'LoSlot5',
  'LoSlot6',
  'LoSlot7',
  'MedSlot0',
  'MedSlot1',
  'MedSlot2',
  'MedSlot3',
  'MedSlot4',
  'MedSlot5',
  'MedSlot6',
  'MedSlot7',
  'HiSlot0',
  'HiSlot1',
  'HiSlot2',
  'HiSlot3',
  'HiSlot4',
  'HiSlot5',
  'HiSlot6',
  'HiSlot7',
  'RigSlot0',
  'RigSlot1',
  'RigSlot2',
  'RigSlot3',
  'RigSlot4',
  'RigSlot5',
  'RigSlot6',
  'RigSlot7',
])

// Flags that represent items inside structures (fuel, services, fighters)
export const STRUCTURE_CONTENT_FLAGS = new Set([
  'StructureActive',
  'StructureInactive',
  'StructureOffline',
  'StructureFuel',
  'StructureServiceSlot0',
  'StructureServiceSlot1',
  'StructureServiceSlot2',
  'StructureServiceSlot3',
  'StructureServiceSlot4',
  'StructureServiceSlot5',
  'StructureServiceSlot6',
  'StructureServiceSlot7',
  'ServiceSlot0',
  'ServiceSlot1',
  'ServiceSlot2',
  'ServiceSlot3',
  'ServiceSlot4',
  'ServiceSlot5',
  'ServiceSlot6',
  'ServiceSlot7',
  'StructureDeedBay',
  'FighterBay',
  'FighterTube0',
  'FighterTube1',
  'FighterTube2',
  'FighterTube3',
  'FighterTube4',
  'QuantumCoreRoom',
  'SecondaryStorage',
])

export function isFittedOrContentFlag(flag: string): boolean {
  return SHIP_CONTENT_FLAGS.has(flag) || STRUCTURE_CONTENT_FLAGS.has(flag)
}

// Flags that represent deliveries
export const DELIVERY_FLAGS = new Set(['Deliveries', 'CorpDeliveries'])

// Flags that represent asset safety
export const ASSET_SAFETY_FLAGS = new Set(['AssetSafety'])

// Office container type ID
export const OFFICE_TYPE_ID = 27

// Corporate division flag to display name mapping
export const DIVISION_FLAG_NAMES: Record<string, string> = {
  CorpSAG1: '1st Division',
  CorpSAG2: '2nd Division',
  CorpSAG3: '3rd Division',
  CorpSAG4: '4th Division',
  CorpSAG5: '5th Division',
  CorpSAG6: '6th Division',
  CorpSAG7: '7th Division',
  OfficeFolder: 'Office Folder',
  OfficeImpound: 'Impounded',
}

// Flags that belong to corporate office divisions
export const OFFICE_DIVISION_FLAGS = new Set([
  'CorpSAG1',
  'CorpSAG2',
  'CorpSAG3',
  'CorpSAG4',
  'CorpSAG5',
  'CorpSAG6',
  'CorpSAG7',
  'OfficeFolder',
  'OfficeImpound',
])
