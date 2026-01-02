import { esi } from '../esi'
import { ESIAssetSchema, ESIAssetNameSchema } from '../schemas'
import { z } from 'zod'
import { chunkArray } from '@/lib/utils'

export type ESIAsset = z.infer<typeof ESIAssetSchema>
export type ESIAssetName = z.infer<typeof ESIAssetNameSchema>

async function fetchAssetNames(
  endpoint: string,
  characterId: number,
  itemIds: number[]
): Promise<ESIAssetName[]> {
  const chunks = chunkArray(itemIds, 1000)
  const results: ESIAssetName[] = []

  for (const chunk of chunks) {
    const names = await esi.fetch<ESIAssetName[]>(endpoint, {
      method: 'POST',
      body: JSON.stringify(chunk),
      characterId,
      schema: z.array(ESIAssetNameSchema),
    })
    results.push(...names)
  }

  return results
}

export async function getCharacterAssets(
  characterId: number,
  authCharacterId?: number
): Promise<ESIAsset[]> {
  return esi.fetchPaginated<ESIAsset>(`/characters/${characterId}/assets`, {
    characterId: authCharacterId ?? characterId,
    schema: ESIAssetSchema,
  })
}

export async function getCharacterAssetNames(
  characterId: number,
  authCharacterId: number,
  itemIds: number[]
): Promise<ESIAssetName[]> {
  return fetchAssetNames(
    `/characters/${characterId}/assets/names`,
    authCharacterId,
    itemIds
  )
}

export async function getCorporationAssetNames(
  corporationId: number,
  characterId: number,
  itemIds: number[]
): Promise<ESIAssetName[]> {
  return fetchAssetNames(
    `/corporations/${corporationId}/assets/names`,
    characterId,
    itemIds
  )
}
