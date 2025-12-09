import { esiClient } from '../esi-client'

export interface ESIContract {
  acceptor_id: number
  assignee_id: number
  availability: 'public' | 'personal' | 'corporation' | 'alliance'
  buyout?: number
  collateral?: number
  contract_id: number
  date_accepted?: string
  date_completed?: string
  date_expired: string
  date_issued: string
  days_to_complete?: number
  end_location_id?: number
  for_corporation: boolean
  issuer_corporation_id: number
  issuer_id: number
  price?: number
  reward?: number
  start_location_id?: number
  status:
    | 'outstanding'
    | 'in_progress'
    | 'finished_issuer'
    | 'finished_contractor'
    | 'finished'
    | 'cancelled'
    | 'rejected'
    | 'failed'
    | 'deleted'
    | 'reversed'
  title?: string
  type: 'unknown' | 'item_exchange' | 'auction' | 'courier' | 'loan'
  volume?: number
}

export interface ESIContractItem {
  is_included: boolean
  is_singleton?: boolean
  quantity: number
  raw_quantity?: number
  record_id: number
  type_id: number
  item_id?: number
  is_blueprint_copy?: boolean
  material_efficiency?: number
  time_efficiency?: number
  runs?: number
}

export async function getCharacterContracts(
  characterId: number
): Promise<ESIContract[]> {
  return esiClient.fetchWithPagination<ESIContract>(
    `/characters/${characterId}/contracts/`,
    { characterId }
  )
}

export async function getContractItems(
  characterId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esiClient.fetch<ESIContractItem[]>(
    `/characters/${characterId}/contracts/${contractId}/items/`,
    { characterId }
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
    { characterId }
  )
}

export async function getCorporationContractItems(
  characterId: number,
  corporationId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esiClient.fetch<ESIContractItem[]>(
    `/corporations/${corporationId}/contracts/${contractId}/items/`,
    { characterId }
  )
}
