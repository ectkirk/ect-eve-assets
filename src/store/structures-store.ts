import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESICorporationStructureSchema } from '@/api/schemas'
import { z } from 'zod'

export type ESICorporationStructure = z.infer<
  typeof ESICorporationStructureSchema
>

export interface OwnerStructures {
  owner: Owner
  structures: ESICorporationStructure[]
}

export const useStructuresStore = createOwnerStore<
  ESICorporationStructure[],
  OwnerStructures
>({
  name: 'structures',
  moduleName: 'StructuresStore',
  endpointPattern: '/structures',
  dbConfig: {
    dbName: 'ecteveassets-structures',
    storeName: 'structures',
    dataKey: 'structures',
  },
  ownerFilter: 'corporation',
  getEndpoint: (owner) => `/corporations/${owner.id}/structures`,
  fetchData: async (owner) => {
    const result = await esi.fetchPaginatedWithMeta<ESICorporationStructure>(
      `/corporations/${owner.id}/structures`,
      { characterId: owner.characterId, schema: ESICorporationStructureSchema }
    )
    return { data: result.data, expiresAt: result.expiresAt, etag: result.etag }
  },
  toOwnerData: (owner, data) => ({ owner, structures: data }),
  isEmpty: (data) => data.length === 0,
})
