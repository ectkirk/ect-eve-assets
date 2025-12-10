import { esiClient } from '../esi-client'
import { ESIBlueprintSchema } from '../schemas'
import { z } from 'zod'

export type ESIBlueprint = z.infer<typeof ESIBlueprintSchema>

export async function getCharacterBlueprints(
  characterId: number,
  authCharacterId?: number
): Promise<ESIBlueprint[]> {
  return esiClient.fetchWithPagination<ESIBlueprint>(
    `/characters/${characterId}/blueprints/`,
    { characterId: authCharacterId ?? characterId, schema: ESIBlueprintSchema }
  )
}

export async function getCorporationBlueprints(
  corporationId: number,
  characterId: number
): Promise<ESIBlueprint[]> {
  return esiClient.fetchWithPagination<ESIBlueprint>(
    `/corporations/${corporationId}/blueprints/`,
    { characterId, schema: ESIBlueprintSchema }
  )
}
