import { esiClient } from '../esi-client'

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
  characterId: number,
  includeCompleted = false
): Promise<ESIIndustryJob[]> {
  const params = includeCompleted ? '?include_completed=true' : ''
  return esiClient.fetch<ESIIndustryJob[]>(
    `/characters/${characterId}/industry/jobs/${params}`,
    { characterId }
  )
}
