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
  position2D?: { x: number; y: number } | null
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
  published?: boolean
}

export interface CachedGroup {
  id: number
  name: string
  categoryId: number
  published?: boolean
}

export interface TypeSlots {
  high: number
  mid: number
  low: number
  rig: number
  subsystem: number
  launcher: number
  turret: number
}

export interface CachedType {
  id: number
  name: string
  groupId: number
  groupName: string
  categoryId: number
  categoryName: string
  marketGroupId?: number | null
  volume: number
  packagedVolume?: number
  implantSlot?: number
  slots?: TypeSlots
  towerSize?: number
  fuelTier?: number
  published?: boolean
  productId?: number
  basePrice?: number
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

export interface CachedStargate {
  id: number
  from: number
  to: number
}

const CachedRegionSchema = z.object({
  id: z.number(),
  name: z.string(),
})

const Position2DSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const CachedSystemSchema = z.object({
  id: z.number(),
  name: z.string(),
  regionId: z.number(),
  securityStatus: z.number().nullable().optional(),
  position2D: Position2DSchema.nullable().optional(),
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
  published: z.boolean().optional(),
})

const CachedGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  categoryId: z.number(),
  published: z.boolean().optional(),
})

const TypeSlotsSchema = z.object({
  high: z.number(),
  mid: z.number(),
  low: z.number(),
  rig: z.number(),
  subsystem: z.number(),
  launcher: z.number(),
  turret: z.number(),
})

const CachedTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  groupId: z.number(),
  groupName: z.string(),
  categoryId: z.number(),
  categoryName: z.string(),
  marketGroupId: z.number().nullable().optional(),
  volume: z.number(),
  packagedVolume: z.number().optional(),
  implantSlot: z.number().optional(),
  slots: TypeSlotsSchema.optional(),
  towerSize: z.number().optional(),
  fuelTier: z.number().optional(),
  published: z.boolean().optional(),
  productId: z.number().optional(),
  basePrice: z.number().optional(),
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

const CachedStargateSchema = z.object({
  id: z.number(),
  from: z.number(),
  to: z.number(),
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
  stargates: CachedStargateSchema,
}
