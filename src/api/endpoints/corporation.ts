import { esiClient } from '../esi-client'
import type { ESIAsset } from './assets'

// Response from /characters/{character_id}/roles/
export interface ESICharacterRoles {
  roles: string[]
  roles_at_hq?: string[]
  roles_at_other?: string[]
  roles_at_base?: string[]
}

// Director role is required for corporation asset access
const DIRECTOR_ROLE = 'Director'

export async function getCorporationAssets(
  corporationId: number,
  characterId: number
): Promise<ESIAsset[]> {
  // Corp assets endpoint uses corp ID but auth token from character with Director role
  return esiClient.fetchWithPagination<ESIAsset>(
    `/corporations/${corporationId}/assets/`,
    { characterId }
  )
}

// Get character's own corporation roles using /characters/{id}/roles/
export async function getCharacterRoles(
  characterId: number
): Promise<ESICharacterRoles> {
  return esiClient.fetch<ESICharacterRoles>(
    `/characters/${characterId}/roles/`,
    { characterId }
  )
}

export function hasDirectorRole(roles: string[]): boolean {
  return roles.includes(DIRECTOR_ROLE)
}

export async function getCharacterCorpRoles(
  characterId: number
): Promise<string[]> {
  try {
    const rolesResponse = await getCharacterRoles(characterId)
    return rolesResponse.roles ?? []
  } catch {
    return []
  }
}
