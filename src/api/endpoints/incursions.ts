import { z } from 'zod'
import { esi } from '../esi'

export const ESIIncursionSchema = z.object({
  constellation_id: z.number(),
  faction_id: z.number(),
  has_boss: z.boolean(),
  infested_solar_systems: z.array(z.number()),
  influence: z.number(),
  staging_solar_system_id: z.number(),
  state: z.enum(['withdrawing', 'mobilizing', 'established']),
  type: z.string(),
})

export type ESIIncursion = z.infer<typeof ESIIncursionSchema>

export async function getIncursions(): Promise<ESIIncursion[]> {
  return esi.fetch<ESIIncursion[]>('/incursions', {
    requiresAuth: false,
    schema: z.array(ESIIncursionSchema),
  })
}
