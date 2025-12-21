import { z } from 'zod'

export interface CachedRegion {
  id: number
  name: string
}

export interface CachedSystem {
  id: number
  name: string
  regionId: number
  securityStatus?: number | null
}

export interface CachedStation {
  id: number
  name: string
  systemId: number
}

export interface CachedRefStructure {
  id: number
  name: string
  systemId?: number | null
}

export interface CachedCategory {
  id: number
  name: string
}

export interface CachedGroup {
  id: number
  name: string
  categoryId: number
}

export interface CachedBlueprint {
  id: number
  productId: number
}

export interface CachedType {
  id: number
  name: string
  groupId: number
  groupName: string
  categoryId: number
  categoryName: string
  volume: number
  packagedVolume?: number
  implantSlot?: number
  towerSize?: number
  fuelTier?: number
}

export interface CachedStructure {
  id: number
  name: string
  solarSystemId: number
  typeId: number
  ownerId: number
  resolvedByCharacterId?: number
  inaccessible?: boolean
}

export interface CachedLocation {
  id: number
  name: string
  type: 'region' | 'system' | 'station' | 'structure' | 'celestial'
  solarSystemId?: number
  solarSystemName?: string
  regionId?: number
  regionName?: string
}

export interface CachedAbyssal {
  id: number
  price: number
  fetchedAt: number
}

export interface CachedName {
  id: number
  name: string
  category:
    | 'alliance'
    | 'character'
    | 'constellation'
    | 'corporation'
    | 'inventory_type'
    | 'region'
    | 'solar_system'
    | 'station'
    | 'faction'
}

const CachedRegionSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const CachedSystemSchema = z.object({
  id: z.number(),
  name: z.string(),
  regionId: z.number(),
  securityStatus: z.number().nullable().optional(),
})

const CachedStationSchema = z.object({
  id: z.number(),
  name: z.string(),
  systemId: z.number(),
})

const CachedRefStructureSchema = z.object({
  id: z.number(),
  name: z.string(),
  systemId: z.number().nullable().optional(),
})

const CachedCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
})

const CachedGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  categoryId: z.number(),
})

const CachedBlueprintSchema = z.object({
  id: z.number(),
  productId: z.number(),
})

const CachedTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  groupId: z.number(),
  groupName: z.string(),
  categoryId: z.number(),
  categoryName: z.string(),
  volume: z.number(),
  packagedVolume: z.number().optional(),
  implantSlot: z.number().optional(),
  towerSize: z.number().optional(),
  fuelTier: z.number().optional(),
})

const CachedStructureSchema = z.object({
  id: z.number(),
  name: z.string(),
  solarSystemId: z.number(),
  typeId: z.number(),
  ownerId: z.number(),
  resolvedByCharacterId: z.number().optional(),
  inaccessible: z.boolean().optional(),
})

const CachedLocationSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(['region', 'system', 'station', 'structure', 'celestial']),
  solarSystemId: z.number().optional(),
  solarSystemName: z.string().optional(),
  regionId: z.number().optional(),
  regionName: z.string().optional(),
})

const CachedAbyssalSchema = z.object({
  id: z.number(),
  price: z.number(),
  fetchedAt: z.number(),
})

const CachedNameSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: z.enum([
    'alliance',
    'character',
    'constellation',
    'corporation',
    'inventory_type',
    'region',
    'solar_system',
    'station',
    'faction',
  ]),
})

export const cacheSchemas: Record<string, z.ZodType> = {
  types: CachedTypeSchema,
  regions: CachedRegionSchema,
  systems: CachedSystemSchema,
  stations: CachedStationSchema,
  refStructures: CachedRefStructureSchema,
  structures: CachedStructureSchema,
  locations: CachedLocationSchema,
  abyssals: CachedAbyssalSchema,
  names: CachedNameSchema,
  categories: CachedCategorySchema,
  groups: CachedGroupSchema,
  blueprints: CachedBlueprintSchema,
}
