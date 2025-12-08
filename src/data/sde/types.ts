// SDE Type (Item) definition
export interface SDEType {
  typeId: number
  name: string
  groupId: number
  categoryId: number
  volume: number
  packagedVolume?: number
  mass?: number
  marketGroupId?: number
  published: boolean
}

// SDE Location definition
export interface SDEStation {
  stationId: number
  name: string
  solarSystemId: number
  regionId: number
  typeId: number
}

export interface SDESolarSystem {
  solarSystemId: number
  name: string
  constellationId: number
  regionId: number
  security: number
}

export interface SDERegion {
  regionId: number
  name: string
}

// Location flags for asset filtering
export const LocationFlags = {
  HANGAR: 4,
  CARGO: 5,
  SHIP_HANGAR: 90,
  DELIVERIES: 173,
  CORP_DELIVERIES: 62,
  ASSET_SAFETY: 36,
  CLONE_BAY: 89,
  IMPLANT: 89,
} as const

export type LocationFlag = (typeof LocationFlags)[keyof typeof LocationFlags]

// Category IDs for filtering
export const CategoryIds = {
  SHIP: 6,
  MODULE: 7,
  CHARGE: 8,
  BLUEPRINT: 9,
  SKILL: 16,
  DRONE: 18,
  IMPLANT: 20,
  STRUCTURE: 65,
} as const
