import { esi } from '../esi'
import {
  ESIContractSchema,
  ESIContractItemSchema,
  ESIContractBidSchema,
} from '../schemas'
import { z } from 'zod'

export type ESIContract = z.infer<typeof ESIContractSchema>
export type ESIContractItem = z.infer<typeof ESIContractItemSchema>
export type ESIContractBid = z.infer<typeof ESIContractBidSchema>

export async function getCharacterContracts(
  characterId: number
): Promise<ESIContract[]> {
  return esi.fetchPaginated<ESIContract>(
    `/characters/${characterId}/contracts`,
    { characterId, schema: ESIContractSchema }
  )
}

export async function getContractItems(
  characterId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esi.fetch<ESIContractItem[]>(
    `/characters/${characterId}/contracts/${contractId}/items`,
    { characterId, schema: z.array(ESIContractItemSchema) }
  )
}

export async function getCorporationContracts(
  characterId: number,
  corporationId: number
): Promise<ESIContract[]> {
  return esi.fetchPaginated<ESIContract>(
    `/corporations/${corporationId}/contracts`,
    { characterId, schema: ESIContractSchema }
  )
}

export async function getCorporationContractItems(
  characterId: number,
  corporationId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esi.fetch<ESIContractItem[]>(
    `/corporations/${corporationId}/contracts/${contractId}/items`,
    { characterId, schema: z.array(ESIContractItemSchema) }
  )
}

export async function getPublicContractItems(
  contractId: number
): Promise<ESIContractItem[]> {
  return esi.fetchPaginated<ESIContractItem>(
    `/contracts/public/items/${contractId}`,
    { requiresAuth: false, schema: ESIContractItemSchema }
  )
}

export async function getPublicContractBids(
  contractId: number
): Promise<ESIContractBid[]> {
  return esi.fetchPaginated<ESIContractBid>(
    `/contracts/public/bids/${contractId}`,
    { requiresAuth: false, schema: ESIContractBidSchema }
  )
}

export async function getCharacterContractBids(
  characterId: number,
  contractId: number
): Promise<ESIContractBid[]> {
  return esi.fetch<ESIContractBid[]>(
    `/characters/${characterId}/contracts/${contractId}/bids`,
    { characterId, schema: z.array(ESIContractBidSchema) }
  )
}

export async function getCorporationContractBids(
  characterId: number,
  corporationId: number,
  contractId: number
): Promise<ESIContractBid[]> {
  return esi.fetchPaginated<ESIContractBid>(
    `/corporations/${corporationId}/contracts/${contractId}/bids`,
    { characterId, schema: ESIContractBidSchema }
  )
}
