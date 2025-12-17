import { esi } from '../esi'
import { ESIStarbaseSchema, ESIStarbaseDetailSchema } from '../schemas'
import { z } from 'zod'

export type ESIStarbase = z.infer<typeof ESIStarbaseSchema>
export type ESIStarbaseDetail = z.infer<typeof ESIStarbaseDetailSchema>

export async function getCorporationStarbases(
  characterId: number,
  corporationId: number
): Promise<ESIStarbase[]> {
  return esi.fetchPaginated<ESIStarbase>(`/corporations/${corporationId}/starbases`, {
    characterId,
    schema: ESIStarbaseSchema,
  })
}

export async function getStarbaseDetail(
  characterId: number,
  corporationId: number,
  starbaseId: number,
  systemId: number
): Promise<ESIStarbaseDetail> {
  return esi.fetch<ESIStarbaseDetail>(
    `/corporations/${corporationId}/starbases/${starbaseId}?system_id=${systemId}`,
    {
      characterId,
      schema: ESIStarbaseDetailSchema,
    }
  )
}
