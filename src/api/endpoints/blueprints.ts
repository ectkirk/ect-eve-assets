import { esi } from '../esi'
import { ESIBlueprintSchema } from '../schemas'
import { z } from 'zod'

export type ESIBlueprint = z.infer<typeof ESIBlueprintSchema>

export async function getCharacterBlueprints(
  characterId: number,
  authCharacterId?: number
): Promise<ESIBlueprint[]> {
  return esi.fetchPaginated<ESIBlueprint>(
    `/characters/${characterId}/blueprints`,
    { characterId: authCharacterId ?? characterId, schema: ESIBlueprintSchema }
  )
}

export async function getCorporationBlueprints(
  corporationId: number,
  characterId: number
): Promise<ESIBlueprint[]> {
  return esi.fetchPaginated<ESIBlueprint>(
    `/corporations/${corporationId}/blueprints`,
    { characterId, schema: ESIBlueprintSchema }
  )
}
