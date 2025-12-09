import { esiClient } from '../esi-client'
import { ESIContractSchema, ESIContractItemSchema } from '../schemas'
import { z } from 'zod'

export type ESIContract = z.infer<typeof ESIContractSchema>
export type ESIContractItem = z.infer<typeof ESIContractItemSchema>

export async function getCharacterContracts(
  characterId: number
): Promise<ESIContract[]> {
  return esiClient.fetchWithPagination<ESIContract>(
    `/characters/${characterId}/contracts/`,
    { characterId, schema: ESIContractSchema }
  )
}

export async function getContractItems(
  characterId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esiClient.fetch<ESIContractItem[]>(
    `/characters/${characterId}/contracts/${contractId}/items/`,
    { characterId, schema: z.array(ESIContractItemSchema) }
  )
}

export async function getPublicContractItems(
  contractId: number
): Promise<ESIContractItem[]> {
  return esiClient.fetchPublic<ESIContractItem[]>(
    `/contracts/public/items/${contractId}/`
  )
}

export async function getCorporationContracts(
  characterId: number,
  corporationId: number
): Promise<ESIContract[]> {
  return esiClient.fetchWithPagination<ESIContract>(
    `/corporations/${corporationId}/contracts/`,
    { characterId, schema: ESIContractSchema }
  )
}

export async function getCorporationContractItems(
  characterId: number,
  corporationId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esiClient.fetch<ESIContractItem[]>(
    `/corporations/${corporationId}/contracts/${contractId}/items/`,
    { characterId, schema: z.array(ESIContractItemSchema) }
  )
}
