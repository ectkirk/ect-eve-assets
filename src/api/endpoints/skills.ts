import { esi } from '../esi'
import { ESICharacterSkillsSchema } from '../schemas'
import { z } from 'zod'

export type ESICharacterSkills = z.infer<typeof ESICharacterSkillsSchema>

export async function getCharacterSkills(
  characterId: number
): Promise<ESICharacterSkills> {
  return esi.fetch<ESICharacterSkills>(`/characters/${characterId}/skills`, {
    characterId,
    schema: ESICharacterSkillsSchema,
  })
}
