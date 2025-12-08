import { esiClient } from '../client'

export interface ESIClone {
  home_location?: {
    location_id: number
    location_type: 'station' | 'structure'
  }
  jump_clones: Array<{
    implants: number[]
    jump_clone_id: number
    location_id: number
    location_type: 'station' | 'structure'
    name?: string
  }>
  last_clone_jump_date?: string
  last_station_change_date?: string
}

export interface ESIImplant {
  implant_id: number
}

export async function getCharacterClones(
  characterId: number
): Promise<ESIClone> {
  return esiClient.fetch<ESIClone>(`/characters/${characterId}/clones/`)
}

export async function getCharacterImplants(
  characterId: number
): Promise<number[]> {
  return esiClient.fetch<number[]>(`/characters/${characterId}/implants/`)
}
