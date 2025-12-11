import { esi } from '../esi'
import { ESIContractSchema, ESIContractItemSchema } from '../schemas'
import { z } from 'zod'

export type ESIContract = z.infer<typeof ESIContractSchema>
export type ESIContractItem = z.infer<typeof ESIContractItemSchema>

export async function getCharacterContracts(
  characterId: number
): Promise<ESIContract[]> {
  return esi.fetchPaginated<ESIContract>(
    `/characters/${characterId}/contracts/`,
    { characterId, schema: ESIContractSchema }
  )
}

export async function getContractItems(
  characterId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esi.fetch<ESIContractItem[]>(
    `/characters/${characterId}/contracts/${contractId}/items/`,
    { characterId, schema: z.array(ESIContractItemSchema) }
  )
}

export async function getPublicContractItems(
  contractId: number
): Promise<ESIContractItem[]> {
  return esi.fetchPaginated<ESIContractItem>(
    `/contracts/public/items/${contractId}/`,
    { requiresAuth: false }
  )
}

export async function getCorporationContracts(
  characterId: number,
  corporationId: number
): Promise<ESIContract[]> {
  return esi.fetchPaginated<ESIContract>(
    `/corporations/${corporationId}/contracts/`,
    { characterId, schema: ESIContractSchema }
  )
}

export async function getCorporationContractItems(
  characterId: number,
  corporationId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esi.fetch<ESIContractItem[]>(
    `/corporations/${corporationId}/contracts/${contractId}/items/`,
    { characterId, schema: z.array(ESIContractItemSchema) }
  )
}
