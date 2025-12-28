import { esi } from '../esi'
import { ESICharacterLocationSchema, ESICharacterShipSchema } from '../schemas'
import { z } from 'zod'

export type ESICharacterLocation = z.infer<typeof ESICharacterLocationSchema>
export type ESICharacterShip = z.infer<typeof ESICharacterShipSchema>

export async function getCharacterLocation(
  characterId: number
): Promise<ESICharacterLocation> {
  return esi.fetch<ESICharacterLocation>(
    `/characters/${characterId}/location`,
    {
      characterId,
      schema: ESICharacterLocationSchema,
    }
  )
}

export async function getCharacterShip(
  characterId: number
): Promise<ESICharacterShip> {
  return esi.fetch<ESICharacterShip>(`/characters/${characterId}/ship`, {
    characterId,
    schema: ESICharacterShipSchema,
  })
}
