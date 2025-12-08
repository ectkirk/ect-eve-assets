import { esiClient } from '../client'

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
  is_singleton: boolean
  quantity: number
  raw_quantity?: number
  record_id: number
  type_id: number
}

export async function getCharacterContracts(
  characterId: number
): Promise<ESIContract[]> {
  return esiClient.fetchWithPagination<ESIContract>(
    `/characters/${characterId}/contracts/`
  )
}

export async function getContractItems(
  characterId: number,
  contractId: number
): Promise<ESIContractItem[]> {
  return esiClient.fetch<ESIContractItem[]>(
    `/characters/${characterId}/contracts/${contractId}/items/`
  )
}
