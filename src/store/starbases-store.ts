import { type Owner, ownerKey } from './auth-store'
import { createOwnerStore, type BaseState } from './create-owner-store'
import { useStarbaseDetailsStore } from './starbase-details-store'
import { getType } from './reference-cache'
import { esi } from '@/api/esi'
import { ESIStarbaseSchema } from '@/api/schemas'
import { processStarbaseNotifications } from '@/lib/structure-notifications'
import { z } from 'zod'

export type ESIStarbase = z.infer<typeof ESIStarbaseSchema>

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
  onBeforeOwnerUpdate: (owner, state: BaseState<OwnerStarbases>) => {
    const key = ownerKey(owner.type, owner.id)
    const previousStarbases =
      state.dataByOwner.find((os) => ownerKey(os.owner.type, os.owner.id) === key)?.starbases ?? []
    return { previousData: previousStarbases }
  },
  onAfterOwnerUpdate: ({ newData, previousData }) => {
    if (!previousData || previousData.length === 0) return

    const details = useStarbaseDetailsStore.getState().details
    const metadata = new Map<number, { towerSize: number; fuelTier: number }>()
    for (const starbase of newData) {
      const type = getType(starbase.type_id)
      if (type?.towerSize !== undefined) {
        metadata.set(starbase.starbase_id, {
          towerSize: type.towerSize,
          fuelTier: type.fuelTier ?? 0,
        })
      }
    }

    processStarbaseNotifications(previousData, newData, details, metadata)
  },
})
