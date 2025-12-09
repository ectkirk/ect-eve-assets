import { esiClient } from '../esi-client'

export interface ESIAsset {
  is_blueprint_copy?: boolean
  is_singleton: boolean
  item_id: number
  location_flag: string
  location_id: number
  location_type: string
  quantity: number
  type_id: number
}

export interface ESIAssetName {
  item_id: number
  name: string
}

export async function getCharacterAssets(
  characterId: number,
  authCharacterId?: number
): Promise<ESIAsset[]> {
  return esiClient.fetchWithPagination<ESIAsset>(
    `/characters/${characterId}/assets/`,
    { characterId: authCharacterId ?? characterId }
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
      }
    )
    results.push(...names)
  }

  return results
}
