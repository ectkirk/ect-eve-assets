import { esiClient } from '../esi-client'

export interface ESICorporationWalletDivision {
  balance: number
  division: number
}

export async function getCharacterWallet(characterId: number): Promise<number> {
  return esiClient.fetch<number>(`/characters/${characterId}/wallet/`, { characterId })
}

export async function getCorporationWallets(
  characterId: number,
  corporationId: number
): Promise<ESICorporationWalletDivision[]> {
  return esiClient.fetch<ESICorporationWalletDivision[]>(
    `/corporations/${corporationId}/wallets/`,
    { characterId }
  )
}
