import { esi } from '../esi'
import type { ESIAsset } from './assets'
import {
  ESIAssetSchema,
  ESICharacterRolesSchema,
  ESICorporationDivisionsSchema,
} from '../schemas'
import { z } from 'zod'
import { logger } from '@/lib/logger'

export type ESICharacterRoles = z.infer<typeof ESICharacterRolesSchema>
export type ESICorporationDivisions = z.infer<
  typeof ESICorporationDivisionsSchema
>

export interface ESICharacterPublic {
  corporation_id: number
  name: string
}

const DIRECTOR_ROLE = 'Director'

export async function getCorporationAssets(
  corporationId: number,
  characterId: number
): Promise<ESIAsset[]> {
  return esi.fetchPaginated<ESIAsset>(`/corporations/${corporationId}/assets`, {
    characterId,
    schema: ESIAssetSchema,
  })
}

export async function getCharacterRoles(
  characterId: number
): Promise<ESICharacterRoles> {
  return esi.fetch<ESICharacterRoles>(`/characters/${characterId}/roles`, {
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
  } catch (error) {
    logger.warn('Failed to fetch character corporation roles', {
      module: 'ESI',
      characterId,
      error,
    })
    return []
  }
}

export async function getCorporationDivisions(
  corporationId: number,
  characterId: number
): Promise<ESICorporationDivisions> {
  return esi.fetch<ESICorporationDivisions>(
    `/corporations/${corporationId}/divisions`,
    { characterId, schema: ESICorporationDivisionsSchema }
  )
}

export async function getCharacterPublic(
  characterId: number
): Promise<ESICharacterPublic> {
  return esi.fetch<ESICharacterPublic>(`/characters/${characterId}/`, {
    requiresAuth: false,
  })
}
