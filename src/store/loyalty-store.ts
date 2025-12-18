import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESILoyaltyPointsSchema } from '@/api/schemas'
import { z } from 'zod'

export type ESILoyaltyPoints = z.infer<typeof ESILoyaltyPointsSchema>

export interface OwnerLoyalty {
  owner: Owner
  loyaltyPoints: ESILoyaltyPoints[]
}

export const useLoyaltyStore = createOwnerStore<ESILoyaltyPoints[], OwnerLoyalty>({
  name: 'loyalty points',
  moduleName: 'LoyaltyStore',
  endpointPattern: '/loyalty/points',
  dbConfig: {
    dbName: 'ecteveassets-loyalty',
    storeName: 'loyalty',
    dataKey: 'loyaltyPoints',
    metaStoreName: 'meta',
  },
  ownerFilter: 'character',
  requiredScope: 'esi-characters.read_loyalty.v1',
  disableAutoRefresh: true,
  getEndpoint: (owner) => `/characters/${owner.characterId}/loyalty/points/`,
  fetchData: async (owner) => {
    return esi.fetchWithMeta<ESILoyaltyPoints[]>(
      `/characters/${owner.characterId}/loyalty/points/`,
      {
        characterId: owner.characterId,
        schema: z.array(ESILoyaltyPointsSchema),
      }
    )
  },
  toOwnerData: (owner, data) => ({ owner, loyaltyPoints: data }),
  isEmpty: (data) => data.length === 0,
})
