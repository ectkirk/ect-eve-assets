import { esiClient } from '../esi-client'
import { ESIAssetSchema, ESIAssetNameSchema } from '../schemas'
import { z } from 'zod'

export type ESIAsset = z.infer<typeof ESIAssetSchema>
export type ESIAssetName = z.infer<typeof ESIAssetNameSchema>

export async function getCharacterAssets(
  characterId: number,
  authCharacterId?: number
): Promise<ESIAsset[]> {
  return esiClient.fetchWithPagination<ESIAsset>(
    `/characters/${characterId}/assets/`,
    { characterId: authCharacterId ?? characterId, schema: ESIAssetSchema }
  )
}

export async function getAssetNames(
  characterId: number,
  authCharacterId: number,
  itemIds: number[]
): Promise<ESIAssetName[]> {
  const chunks: number[][] = []
  for (let i = 0; i < itemIds.length; i += 1000) {
    chunks.push(itemIds.slice(i, i + 1000))
  }

  const results: ESIAssetName[] = []
  for (const chunk of chunks) {
    const names = await esiClient.fetch<ESIAssetName[]>(
      `/characters/${characterId}/assets/names/`,
      {
        method: 'POST',
        body: JSON.stringify(chunk),
        characterId: authCharacterId,
        schema: z.array(ESIAssetNameSchema),
      }
    )
    results.push(...names)
  }

  return results
}
