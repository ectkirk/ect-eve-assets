export type ColorMode = 'region' | 'security' | 'faction' | 'alliance'

export interface HoveredSystem {
  id: number
  name: string
  security: number
  screenX: number
  screenY: number
  regionName?: string
  factionName?: string
  allianceName?: string
  stationNames?: string[]
  structureNames?: string[]
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CoordinateData extends Bounds {
  scale: number
  padding: number
}

export interface SearchResult {
  type: 'system' | 'region'
  name: string
  id: number
}

export const FACTION_NAMES: Record<number, string> = {
  500001: 'Caldari State',
  500002: 'Minmatar Republic',
  500003: 'Amarr Empire',
  500004: 'Gallente Federation',
}
