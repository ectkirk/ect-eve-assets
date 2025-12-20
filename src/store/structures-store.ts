import { type Owner, ownerKey } from './auth-store'
import { createOwnerStore, type BaseState } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESICorporationStructureSchema } from '@/api/schemas'
import { processUpwellNotifications } from '@/lib/structure-notifications'
import { z } from 'zod'

export type ESICorporationStructure = z.infer<typeof ESICorporationStructureSchema>

export interface OwnerStructures {
  owner: Owner
  structures: ESICorporationStructure[]
}

interface StructuresExtraActions {
  getTotal: (prices: Map<number, number>, selectedOwnerIds: string[]) => number
}

export const useStructuresStore = createOwnerStore<
  ESICorporationStructure[],
  OwnerStructures,
  object,
  StructuresExtraActions
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
  onBeforeOwnerUpdate: (owner, state: BaseState<OwnerStructures>) => {
    const key = ownerKey(owner.type, owner.id)
    const previousStructures =
      state.dataByOwner.find((os) => ownerKey(os.owner.type, os.owner.id) === key)?.structures ?? []
    return { previousData: previousStructures }
  },
  onAfterOwnerUpdate: ({ newData, previousData }) => {
    if (!previousData || previousData.length === 0) return
    processUpwellNotifications(previousData, newData)
  },
  extraActions: (_set, get) => ({
    getTotal: (prices, selectedOwnerIds) => {
      const selectedSet = new Set(selectedOwnerIds)
      let total = 0
      for (const { owner, structures } of get().dataByOwner) {
        if (!selectedSet.has(ownerKey(owner.type, owner.id))) continue
        for (const structure of structures) {
          total += prices.get(structure.type_id) ?? 0
        }
      }
      return total
    },
  }),
})

