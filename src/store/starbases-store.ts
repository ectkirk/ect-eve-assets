import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESIStarbaseSchema } from '@/api/schemas'
import { type ESIStarbase } from '@/api/endpoints/starbases'
import {
  registerCollector,
  needsTypeResolution,
  hasLocation,
  type ResolutionIds,
} from '@/lib/data-resolver'

export type { ESIStarbase }

export interface OwnerStarbases {
  owner: Owner
  starbases: ESIStarbase[]
}

export const useStarbasesStore = createOwnerStore<
  ESIStarbase[],
  OwnerStarbases
>({
  name: 'starbases',
  moduleName: 'StarbasesStore',
  endpointPattern: '/starbases',
  dbConfig: {
    dbName: 'ecteveassets-starbases',
    storeName: 'starbases',
    dataKey: 'starbases',
  },
  ownerFilter: 'corporation',
  requiredScope: 'esi-corporations.read_starbases.v1',
  getEndpoint: (owner) => `/corporations/${owner.id}/starbases`,
  fetchData: async (owner) => {
    const result = await esi.fetchPaginatedWithMeta<ESIStarbase>(
      `/corporations/${owner.id}/starbases`,
      { characterId: owner.characterId, schema: ESIStarbaseSchema }
    )
    return { data: result.data, expiresAt: result.expiresAt, etag: result.etag }
  },
  toOwnerData: (owner, data) => ({ owner, starbases: data }),
  isEmpty: (data) => data.length === 0,
})

registerCollector('starbases', (ids: ResolutionIds) => {
  const { dataByOwner } = useStarbasesStore.getState()

  for (const { starbases } of dataByOwner) {
    for (const starbase of starbases) {
      if (needsTypeResolution(starbase.type_id)) {
        ids.typeIds.add(starbase.type_id)
      }
      if (!hasLocation(starbase.system_id)) {
        ids.locationIds.add(starbase.system_id)
      }
      if (starbase.moon_id && !hasLocation(starbase.moon_id)) {
        ids.locationIds.add(starbase.moon_id)
      }
    }
  }
})
