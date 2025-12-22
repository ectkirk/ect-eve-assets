import { esi } from '../esi'
import { ESICorporationStructureSchema } from '../schemas'
import { z } from 'zod'

export type ESICorporationStructure = z.infer<
  typeof ESICorporationStructureSchema
>

export async function getCorporationStructures(
  characterId: number,
  corporationId: number
): Promise<ESICorporationStructure[]> {
  const endpoint = `/corporations/${corporationId}/structures`
  return esi.fetchPaginated<ESICorporationStructure>(endpoint, {
    characterId,
    schema: ESICorporationStructureSchema,
  })
}
