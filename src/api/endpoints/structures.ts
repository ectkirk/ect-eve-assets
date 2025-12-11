import { esiClient } from '../esi-client'
import { logger } from '@/lib/logger'
import { ESICorporationStructureSchema } from '../schemas'
import { z } from 'zod'

export type ESICorporationStructure = z.infer<typeof ESICorporationStructureSchema>

export async function getCorporationStructures(
  characterId: number,
  corporationId: number
): Promise<ESICorporationStructure[]> {
  const endpoint = `/corporations/${corporationId}/structures`
  logger.debug('Fetching corporation structures', {
    module: 'Structures',
    corporationId,
    endpoint,
  })
  const result = await esiClient.fetchWithPagination<ESICorporationStructure>(endpoint, {
    characterId,
    schema: ESICorporationStructureSchema,
  })
  logger.debug('Corporation structures result', {
    module: 'Structures',
    corporationId,
    count: result.length,
  })
  return result
}
