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

export const ESIMarketOrderHistorySchema = ESIMarketOrderSchema.extend({
  state: z.enum(['cancelled', 'expired', 'completed']),
})

export const ESICorporationMarketOrderSchema = z.object({
  duration: z.number(),
  escrow: z.number().optional(),
  is_buy_order: z.boolean().optional().default(false),
  issued: z.string(),
  issued_by: z.number(),
  location_id: z.number(),
  min_volume: z.number().optional(),
  order_id: z.number(),
  price: z.number(),
  range: z.string(),
  region_id: z.number(),
  type_id: z.number(),
  volume_remain: z.number(),
  volume_total: z.number(),
  wallet_division: z.number(),
})

export const ESICorporationMarketOrderHistorySchema = ESICorporationMarketOrderSchema.extend({
  state: z.enum(['cancelled', 'expired', 'completed']),
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
  location_id: z.number().optional(),
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

// ESI Starbases (POSes)
const StarbaseRoleSchema = z.enum([
  'alliance_member',
  'config_starbase_equipment_role',
  'corporation_member',
  'starbase_fuel_technician_role',
])

export const ESIStarbaseSchema = z.object({
  moon_id: z.number().optional(),
  onlined_since: z.string().optional(),
  reinforced_until: z.string().optional(),
  starbase_id: z.number(),
  state: z.enum(['offline', 'online', 'onlining', 'reinforced', 'unanchoring']).optional(),
  system_id: z.number(),
  type_id: z.number(),
  unanchor_at: z.string().optional(),
})

export const ESIStarbaseFuelSchema = z.object({
  quantity: z.number(),
  type_id: z.number(),
})

export const ESIStarbaseDetailSchema = z.object({
  allow_alliance_members: z.boolean(),
  allow_corporation_members: z.boolean(),
  anchor: StarbaseRoleSchema,
  attack_if_at_war: z.boolean(),
  attack_if_other_security_status_dropping: z.boolean(),
  attack_security_status_threshold: z.number().optional(),
  attack_standing_threshold: z.number().optional(),
  fuel_bay_take: StarbaseRoleSchema,
  fuel_bay_view: StarbaseRoleSchema,
  fuels: z.array(ESIStarbaseFuelSchema).optional(),
  offline: StarbaseRoleSchema,
  online: StarbaseRoleSchema,
  unanchor: StarbaseRoleSchema,
  use_alliance_standings: z.boolean(),
})

// ESI Corporation Structures
export const ESICorporationStructureServiceSchema = z.object({
  name: z.string(),
  state: z.enum(['online', 'offline', 'cleanup']),
})

export const ESICorporationStructureSchema = z.object({
  corporation_id: z.number(),
  fuel_expires: z.string().optional(),
  name: z.string().optional(),
  next_reinforce_apply: z.string().optional(),
  next_reinforce_hour: z.number().optional(),
  profile_id: z.number(),
  reinforce_hour: z.number().optional(),
  services: z.array(ESICorporationStructureServiceSchema).optional(),
  state: z.enum([
    'anchor_vulnerable',
    'anchoring',
    'armor_reinforce',
    'armor_vulnerable',
    'deploy_vulnerable',
    'fitting_invulnerable',
    'hull_reinforce',
    'hull_vulnerable',
    'online_deprecated',
    'onlining_vulnerable',
    'shield_vulnerable',
    'unanchored',
    'unknown',
  ]),
  state_timer_end: z.string().optional(),
  state_timer_start: z.string().optional(),
  structure_id: z.number(),
  system_id: z.number(),
  type_id: z.number(),
  unanchors_at: z.string().optional(),
})

// ESI Blueprints
export const ESIBlueprintSchema = z.object({
  item_id: z.number(),
  location_flag: z.string(),
  location_id: z.number(),
  material_efficiency: z.number(),
  quantity: z.number(),
  runs: z.number(),
  time_efficiency: z.number(),
  type_id: z.number(),
})

// ESI Corporation
export const ESICharacterRolesSchema = z.object({
  roles: z.array(z.string()),
  roles_at_hq: z.array(z.string()).optional(),
  roles_at_other: z.array(z.string()).optional(),
  roles_at_base: z.array(z.string()).optional(),
})

// ESI Loyalty Points
export const ESILoyaltyPointsSchema = z.object({
  corporation_id: z.number(),
  loyalty_points: z.number(),
})

// ESI Location
export const ESICharacterLocationSchema = z.object({
  solar_system_id: z.number(),
  station_id: z.number().optional(),
  structure_id: z.number().optional(),
})

export const ESICharacterShipSchema = z.object({
  ship_item_id: z.number(),
  ship_name: z.string(),
  ship_type_id: z.number(),
})

// ESI Wallet
export const ESICorporationWalletDivisionSchema = z.object({
  balance: z.number(),
  division: z.number(),
})

export const ESIWalletJournalEntrySchema = z.object({
  id: z.number(),
  date: z.string(),
  ref_type: z.string(),
  description: z.string(),
  amount: z.number().optional(),
  balance: z.number().optional(),
  first_party_id: z.number().optional(),
  second_party_id: z.number().optional(),
  context_id: z.number().optional(),
  context_id_type: z.enum([
    'structure_id',
    'station_id',
    'market_transaction_id',
    'character_id',
    'corporation_id',
    'alliance_id',
    'eve_system',
    'industry_job_id',
    'contract_id',
    'planet_id',
    'system_id',
    'type_id',
  ]).optional(),
  reason: z.string().optional(),
  tax: z.number().optional(),
  tax_receiver_id: z.number().optional(),
})

// ESI Corporation Divisions
export const ESIDivisionSchema = z.object({
  division: z.number(),
  name: z.string().optional(),
})

export const ESICorporationDivisionsSchema = z.object({
  hangar: z.array(ESIDivisionSchema).optional(),
  wallet: z.array(ESIDivisionSchema).optional(),
})

// ref-client schemas
export const RefTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  groupId: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  packagedVolume: z.number().nullable().optional(),
})

export const RefTypeBulkResponseSchema = z.object({
  items: z.record(z.string(), RefTypeSchema),
})

export const RefCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const RefCategoriesResponseSchema = z.object({
  items: z.record(z.string(), RefCategorySchema),
})

export const RefGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  categoryId: z.number(),
})

export const RefGroupsResponseSchema = z.object({
  items: z.record(z.string(), RefGroupSchema),
})

export const RefRegionSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const RefRegionsResponseSchema = z.object({
  items: z.record(z.string(), RefRegionSchema),
})

export const RefSystemSchema = z.object({
  id: z.number(),
  name: z.string(),
  regionId: z.number(),
  securityStatus: z.number().nullable().optional(),
})

export const RefSystemsResponseSchema = z.object({
  items: z.record(z.string(), RefSystemSchema),
})

export const RefStationSchema = z.object({
  id: z.number(),
  name: z.string(),
  systemId: z.number(),
})

export const RefStationsResponseSchema = z.object({
  items: z.record(z.string(), RefStationSchema),
})

export const RefImplantSchema = z.object({
  slot: z.number(),
})

export const RefImplantsResponseSchema = z.object({
  items: z.record(z.string(), RefImplantSchema),
})

export const RefUniverseItemSchema = z.object({
  type: z.enum(['region', 'constellation', 'system', 'station', 'structure', 'celestial']),
  name: z.string(),
  solarSystemId: z.number().optional(),
  solarSystemName: z.string().optional(),
  regionId: z.number().optional(),
  regionName: z.string().optional(),
})

export const RefUniverseBulkResponseSchema = z.object({
  items: z.record(z.string(), RefUniverseItemSchema),
})

export const MarketBulkItemSchema = z.object({
  lowestSell: z.number().nullable(),
  averagePrice: z.number().nullable().optional(),
  avg30dPrice: z.number().nullable().optional(),
  avg30dVolume: z.number().nullable().optional(),
  highestBuy: z.number().nullable().optional(),
})

export const MarketBulkResponseSchema = z.object({
  regionId: z.number(),
  items: z.record(z.string(), MarketBulkItemSchema),
})

export const MarketJitaResponseSchema = z.object({
  items: z.record(z.string(), z.number().nullable()),
})

export const MarketPlexResponseSchema = z.object({
  typeId: z.number(),
  lowestSell: z.number().nullable(),
  highestBuy: z.number().nullable(),
})

export const MarketContractItemSchema = z.object({
  price: z.number().nullable(),
  salesCount: z.number(),
  timeWindow: z.string(),
  hasSufficientData: z.boolean(),
})

export const MarketContractsResponseSchema = z.object({
  items: z.record(z.string(), MarketContractItemSchema),
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
