import { esiClient } from '../esi-client'
import { logger } from '@/lib/logger'

export interface ESIIndustryJob {
  activity_id: number
  blueprint_id: number
  blueprint_location_id: number
  blueprint_type_id: number
  completed_character_id?: number
  completed_date?: string
  cost?: number
  duration: number
  end_date: string
  facility_id: number
  installer_id: number
  job_id: number
  licensed_runs?: number
  output_location_id: number
  pause_date?: string
  probability?: number
  product_type_id?: number
  runs: number
  start_date: string
  station_id: number
  status: 'active' | 'cancelled' | 'delivered' | 'paused' | 'ready' | 'reverted'
  successful_runs?: number
}

export async function getCharacterIndustryJobs(
  characterId: number
): Promise<ESIIndustryJob[]> {
  const endpoint = `/characters/${characterId}/industry/jobs`
  logger.debug('Fetching character industry jobs', {
    module: 'Industry',
    characterId,
    endpoint,
  })
  const result = await esiClient.fetch<ESIIndustryJob[]>(endpoint, { characterId })
  logger.debug('Character industry jobs result', {
    module: 'Industry',
    characterId,
    count: result.length,
  })
  return result
}

export async function getCorporationIndustryJobs(
  characterId: number,
  corporationId: number
): Promise<ESIIndustryJob[]> {
  const endpoint = `/corporations/${corporationId}/industry/jobs`
  return esiClient.fetchWithPagination<ESIIndustryJob>(endpoint, { characterId })
}
