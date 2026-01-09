import { esi } from '../esi'

export interface ESIIncursion {
  constellation_id: number
  faction_id: number
  has_boss: boolean
  infested_solar_systems: number[]
  influence: number
  staging_solar_system_id: number
  state: 'withdrawing' | 'mobilizing' | 'established'
  type: string
}

export async function getIncursions(): Promise<ESIIncursion[]> {
  return esi.fetch<ESIIncursion[]>('/incursions')
}
