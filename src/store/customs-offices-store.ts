import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESICustomsOfficeSchema } from '@/api/schemas'
import { type ESICustomsOffice } from '@/api/endpoints/customs-offices'

export type { ESICustomsOffice }

export interface OwnerCustomsOffices {
  owner: Owner
  customsOffices: ESICustomsOffice[]
}

export const useCustomsOfficesStore = createOwnerStore<
  ESICustomsOffice[],
  OwnerCustomsOffices
>({
  name: 'customs-offices',
  moduleName: 'CustomsOfficesStore',
  endpointPattern: '/customs_offices',
  dbConfig: {
    dbName: 'ecteveassets-customs-offices',
    storeName: 'customs-offices',
    dataKey: 'customsOffices',
  },
  ownerFilter: 'corporation',
  requiredScope: 'esi-planets.read_customs_offices.v1',
  getEndpoint: (owner) => `/corporations/${owner.id}/customs_offices`,
  fetchData: async (owner) => {
    const result = await esi.fetchPaginatedWithMeta<ESICustomsOffice>(
      `/corporations/${owner.id}/customs_offices`,
      { characterId: owner.characterId, schema: ESICustomsOfficeSchema }
    )
    return { data: result.data, expiresAt: result.expiresAt, etag: result.etag }
  },
  toOwnerData: (owner, data) => ({ owner, customsOffices: data }),
  isEmpty: (data) => data.length === 0,
})
