import { esiClient } from '../esi-client'
import { ESICorporationWalletDivisionSchema } from '../schemas'
import { z } from 'zod'

export type ESICorporationWalletDivision = z.infer<typeof ESICorporationWalletDivisionSchema>

export async function getCharacterWallet(characterId: number): Promise<number> {
  return esiClient.fetch<number>(`/characters/${characterId}/wallet/`, {
    characterId,
    schema: z.number(),
  })
}

export async function getCorporationWallets(
  characterId: number,
  corporationId: number
): Promise<ESICorporationWalletDivision[]> {
  return esiClient.fetch<ESICorporationWalletDivision[]>(
    `/corporations/${corporationId}/wallets/`,
    { characterId, schema: z.array(ESICorporationWalletDivisionSchema) }
  )
}
