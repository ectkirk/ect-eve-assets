import { esi } from '../esi'
import { ESICloneSchema } from '../schemas'
import { z } from 'zod'

export type ESIClone = z.infer<typeof ESICloneSchema>

export async function getCharacterClones(
  characterId: number
): Promise<ESIClone> {
  return esi.fetch<ESIClone>(`/characters/${characterId}/clones/`, {
    characterId,
    schema: ESICloneSchema,
  })
}

export async function getCharacterImplants(
  characterId: number
): Promise<number[]> {
  return esi.fetch<number[]>(`/characters/${characterId}/implants/`, {
    characterId,
    schema: z.array(z.number()),
  })
}
