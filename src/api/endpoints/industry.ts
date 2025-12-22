import { esi } from '../esi'
import { ESIIndustryJobSchema } from '../schemas'
import { z } from 'zod'

export type ESIIndustryJob = z.infer<typeof ESIIndustryJobSchema>

export async function getCharacterIndustryJobs(
  characterId: number
): Promise<ESIIndustryJob[]> {
  const endpoint = `/characters/${characterId}/industry/jobs`
  return esi.fetch<ESIIndustryJob[]>(endpoint, {
    characterId,
    schema: z.array(ESIIndustryJobSchema),
  })
}

export async function getCorporationIndustryJobs(
  characterId: number,
  corporationId: number
): Promise<ESIIndustryJob[]> {
  const endpoint = `/corporations/${corporationId}/industry/jobs`
  return esi.fetchPaginated<ESIIndustryJob>(endpoint, {
    characterId,
    schema: ESIIndustryJobSchema,
  })
}
