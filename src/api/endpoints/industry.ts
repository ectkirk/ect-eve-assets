import { esiClient } from '../esi-client'
import { logger } from '@/lib/logger'
import { ESIIndustryJobSchema } from '../schemas'
import { z } from 'zod'

export type ESIIndustryJob = z.infer<typeof ESIIndustryJobSchema>

export async function getCharacterIndustryJobs(
  characterId: number
): Promise<ESIIndustryJob[]> {
  const endpoint = `/characters/${characterId}/industry/jobs`
  logger.debug('Fetching character industry jobs', {
    module: 'Industry',
    characterId,
    endpoint,
  })
  const result = await esiClient.fetch<ESIIndustryJob[]>(endpoint, {
    characterId,
    schema: z.array(ESIIndustryJobSchema),
  })
  logger.debug('Character industry jobs result', {
    module: 'Industry',
    characterId,
    count: result.length,
  })
  return result
}

export async function getCorporationIndustryJobs(
  characterId: number,
  corporationId: number
): Promise<ESIIndustryJob[]> {
  const endpoint = `/corporations/${corporationId}/industry/jobs`
  return esiClient.fetchWithPagination<ESIIndustryJob>(endpoint, {
    characterId,
    schema: ESIIndustryJobSchema,
  })
}
