import { z } from 'zod'

// ESI Assets
export const ESIAssetSchema = z.object({
  is_blueprint_copy: z.boolean().optional(),
  is_singleton: z.boolean(),
  item_id: z.number(),
  location_flag: z.string(),
  location_id: z.number(),
  location_type: z.string(),
  quantity: z.number(),
  type_id: z.number(),
})

export const ESIAssetNameSchema = z.object({
  item_id: z.number(),
  name: z.string(),
})

// ESI Contracts
export const ESIContractSchema = z.object({
  acceptor_id: z.number(),
  assignee_id: z.number(),
  availability: z.enum(['public', 'personal', 'corporation', 'alliance']),
  buyout: z.number().optional(),
  collateral: z.number().optional(),
  contract_id: z.number(),
  date_accepted: z.string().optional(),
  date_completed: z.string().optional(),
  date_expired: z.string(),
  date_issued: z.string(),
  days_to_complete: z.number().optional(),
  end_location_id: z.number().optional(),
  for_corporation: z.boolean(),
  issuer_corporation_id: z.number(),
  issuer_id: z.number(),
  price: z.number().optional(),
  reward: z.number().optional(),
  start_location_id: z.number().optional(),
  status: z.enum([
    'outstanding',
    'in_progress',
    'finished_issuer',
    'finished_contractor',
    'finished',
    'cancelled',
    'rejected',
    'failed',
    'deleted',
    'reversed',
  ]),
  title: z.string().optional(),
  type: z.enum(['unknown', 'item_exchange', 'auction', 'courier', 'loan']),
  volume: z.number().optional(),
})

export const ESIContractItemSchema = z.object({
  is_included: z.boolean(),
  is_singleton: z.boolean().optional(),
  quantity: z.number(),
  raw_quantity: z.number().optional(),
  record_id: z.number(),
  type_id: z.number(),
  item_id: z.number().optional(),
  is_blueprint_copy: z.boolean().optional(),
  material_efficiency: z.number().optional(),
  time_efficiency: z.number().optional(),
  runs: z.number().optional(),
})

// ESI Market
export const ESIMarketOrderSchema = z.object({
  duration: z.number(),
  escrow: z.number().optional(),
  is_buy_order: z.boolean().optional().default(false),
  is_corporation: z.boolean(),
  issued: z.string(),
  location_id: z.number(),
  min_volume: z.number().optional(),
  order_id: z.number(),
  price: z.number(),
  range: z.string(),
  region_id: z.number(),
  type_id: z.number(),
  volume_remain: z.number(),
  volume_total: z.number(),
})

export const ESIRegionOrderSchema = z.object({
  duration: z.number(),
  is_buy_order: z.boolean(),
  issued: z.string(),
  location_id: z.number(),
  min_volume: z.number(),
  order_id: z.number(),
  price: z.number(),
  range: z.string(),
  system_id: z.number(),
  type_id: z.number(),
  volume_remain: z.number(),
  volume_total: z.number(),
})

export const ESIMarketPriceSchema = z.object({
  adjusted_price: z.number().optional(),
  average_price: z.number().optional(),
  type_id: z.number(),
})

// ESI Industry
export const ESIIndustryJobSchema = z.object({
  activity_id: z.number(),
  blueprint_id: z.number(),
  blueprint_location_id: z.number(),
  blueprint_type_id: z.number(),
  completed_character_id: z.number().optional(),
  completed_date: z.string().optional(),
  cost: z.number().optional(),
  duration: z.number(),
  end_date: z.string(),
  facility_id: z.number(),
  installer_id: z.number(),
  job_id: z.number(),
  licensed_runs: z.number().optional(),
  output_location_id: z.number(),
  pause_date: z.string().optional(),
  probability: z.number().optional(),
  product_type_id: z.number().optional(),
  runs: z.number(),
  start_date: z.string(),
  station_id: z.number().optional(),
  status: z.enum(['active', 'cancelled', 'delivered', 'paused', 'ready', 'reverted']),
  successful_runs: z.number().optional(),
})

// ESI Clones
export const ESICloneSchema = z.object({
  home_location: z
    .object({
      location_id: z.number(),
      location_type: z.enum(['station', 'structure']),
    })
    .optional(),
  jump_clones: z.array(
    z.object({
      implants: z.array(z.number()),
      jump_clone_id: z.number(),
      location_id: z.number(),
      location_type: z.enum(['station', 'structure']),
      name: z.string().optional(),
    })
  ),
  last_clone_jump_date: z.string().optional(),
  last_station_change_date: z.string().optional(),
})

// ESI Universe
export const ESIStructureSchema = z.object({
  name: z.string(),
  owner_id: z.number(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional(),
  solar_system_id: z.number(),
  type_id: z.number().optional(),
})

export const ESINameSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: z.enum([
    'character',
    'corporation',
    'alliance',
    'faction',
    'station',
    'solar_system',
    'constellation',
    'region',
    'inventory_type',
  ]),
})

// ESI Corporation
export const ESICharacterRolesSchema = z.object({
  roles: z.array(z.string()),
  roles_at_hq: z.array(z.string()).optional(),
  roles_at_other: z.array(z.string()).optional(),
  roles_at_base: z.array(z.string()).optional(),
})

// ESI Wallet
export const ESICorporationWalletDivisionSchema = z.object({
  balance: z.number(),
  division: z.number(),
})

// ref-client schemas
export const RefMarketPriceSchema = z.object({
  adjusted: z.union([z.string(), z.number(), z.null()]).optional(),
  average: z.union([z.string(), z.number(), z.null()]).optional(),
  highestBuy: z.number().nullable().optional(),
  lowestSell: z.number().nullable().optional(),
})

export const RefTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  groupId: z.number().nullable().optional(),
  groupName: z.string().nullable().optional(),
  categoryId: z.number().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  volume: z.number().nullable().optional(),
  packagedVolume: z.number().nullable().optional(),
  basePrice: z.number().nullable().optional(),
  marketPrice: RefMarketPriceSchema,
})

export const RefTypeBulkResponseSchema = z.object({
  items: z.record(z.string(), RefTypeSchema),
})

export const RefUniverseItemSchema = z.object({
  type: z.enum(['region', 'constellation', 'system', 'station', 'structure']),
  name: z.string(),
  solarSystemId: z.number().optional(),
  solarSystemName: z.string().optional(),
  regionId: z.number().optional(),
  regionName: z.string().optional(),
})

export const RefUniverseBulkResponseSchema = z.object({
  items: z.record(z.string(), RefUniverseItemSchema),
})

// Mutamarket schemas
export const MutamarketModuleSchema = z.object({
  id: z.number(),
  type: z.object({
    id: z.number(),
    name: z.string(),
  }),
  source_type: z.object({
    id: z.number(),
    name: z.string(),
    meta_group: z.string().nullable().optional(),
    meta_group_id: z.number().nullable().optional(),
    published: z.boolean().optional(),
  }),
  mutaplasmid: z
    .object({
      id: z.number(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  estimated_value: z.number().nullable().optional(),
  estimated_value_updated_at: z.string().nullable().optional(),
  slug: z.string().nullable().optional(),
  contract: z
    .object({
      id: z.number(),
      type: z.string(),
      price: z.number(),
    })
    .nullable()
    .optional(),
})

// Helper to validate arrays
export function validateArray<T>(schema: z.ZodType<T>, data: unknown): T[] {
  const arraySchema = z.array(schema)
  return arraySchema.parse(data)
}

// Helper to validate with safe parsing (returns null on error)
export function safeValidate<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data)
  return result.success ? result.data : null
}

export function safeValidateArray<T>(schema: z.ZodType<T>, data: unknown): T[] | null {
  const arraySchema = z.array(schema)
  const result = arraySchema.safeParse(data)
  return result.success ? result.data : null
}
