import { z } from 'zod'
import { esi } from '../esi'
import { ESIFWSystemSchema, ESISovereigntyMapEntrySchema } from '../schemas'
import { resolveNames } from './universe'
import { logger } from '@/lib/logger'

export type ESIFWSystem = z.infer<typeof ESIFWSystemSchema>
export type ESISovereigntyMapEntry = z.infer<
  typeof ESISovereigntyMapEntrySchema
>

export interface FactionWarfareData {
  systems: Map<number, number>
}

export interface AllianceSovereigntyData {
  systems: Map<number, { allianceId: number; allianceName: string }>
}

export async function getFactionWarfareSystems(): Promise<FactionWarfareData> {
  const systems = new Map<number, number>()

  try {
    const data = await esi.fetch<ESIFWSystem[]>('/fw/systems', {
      requiresAuth: false,
      schema: z.array(ESIFWSystemSchema),
    })

    for (const system of data) {
      systems.set(system.solar_system_id, system.owner_faction_id)
    }

    logger.info('Loaded FW systems', { module: 'ESI', count: systems.size })
  } catch (error) {
    logger.error('Failed to load FW systems', error, { module: 'ESI' })
  }

  return { systems }
}

export async function getAllianceSovereignty(): Promise<AllianceSovereigntyData> {
  const systems = new Map<
    number,
    { allianceId: number; allianceName: string }
  >()

  try {
    const data = await esi.fetch<ESISovereigntyMapEntry[]>('/sovereignty/map', {
      requiresAuth: false,
      schema: z.array(ESISovereigntyMapEntrySchema),
    })

    const allianceSystems = data.filter((e) => e.alliance_id && !e.faction_id)
    const allianceIds = [...new Set(allianceSystems.map((e) => e.alliance_id!))]

    const names = await resolveNames(allianceIds)

    for (const entry of allianceSystems) {
      if (entry.alliance_id) {
        const nameEntry = names.get(entry.alliance_id)
        systems.set(entry.system_id, {
          allianceId: entry.alliance_id,
          allianceName: nameEntry?.name ?? `Alliance ${entry.alliance_id}`,
        })
      }
    }

    logger.info('Loaded alliance sovereignty', {
      module: 'ESI',
      systems: systems.size,
      alliances: allianceIds.length,
    })
  } catch (error) {
    logger.error('Failed to load alliance sovereignty', error, {
      module: 'ESI',
    })
  }

  return { systems }
}
