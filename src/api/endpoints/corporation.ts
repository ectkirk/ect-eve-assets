import { esi } from '../esi'
import type { ESIAsset } from './assets'
import {
  ESIAssetSchema,
  ESICharacterRolesSchema,
  ESICorporationDivisionsSchema,
} from '../schemas'
import { z } from 'zod'

export type ESICharacterRoles = z.infer<typeof ESICharacterRolesSchema>
export type ESICorporationDivisions = z.infer<
  typeof ESICorporationDivisionsSchema
>

const DIRECTOR_ROLE = 'Director'

export async function getCorporationAssets(
  corporationId: number,
  characterId: number
): Promise<ESIAsset[]> {
  return esi.fetchPaginated<ESIAsset>(
    `/corporations/${corporationId}/assets/`,
    { characterId, schema: ESIAssetSchema }
  )
}

export async function getCharacterRoles(
  characterId: number
): Promise<ESICharacterRoles> {
  return esi.fetch<ESICharacterRoles>(`/characters/${characterId}/roles/`, {
    characterId,
    schema: ESICharacterRolesSchema,
  })
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

export async function getCorporationDivisions(
  corporationId: number,
  characterId: number
): Promise<ESICorporationDivisions> {
  return esi.fetch<ESICorporationDivisions>(
    `/corporations/${corporationId}/divisions/`,
    { characterId, schema: ESICorporationDivisionsSchema }
  )
}
