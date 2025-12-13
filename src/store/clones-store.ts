import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESICloneSchema } from '@/api/schemas'
import { z } from 'zod'

export type ESIClone = z.infer<typeof ESICloneSchema>

interface CloneData {
  clones: ESIClone
  activeImplants: number[]
}

export interface CharacterCloneData {
  owner: Owner
  clones: ESIClone
  activeImplants: number[]
}

export const useClonesStore = createOwnerStore<CloneData, CharacterCloneData>({
  name: 'clones',
  moduleName: 'ClonesStore',
  endpointPattern: '/clones/',
  dbConfig: {
    dbName: 'ecteveassets-clones',
    storeName: 'clones',
    metaStoreName: 'meta',
    serialize: (data) => ({ clones: data.clones, activeImplants: data.activeImplants }),
    deserialize: (stored) => ({
      clones: stored.clones as ESIClone,
      activeImplants: stored.activeImplants as number[],
    }),
  },
  ownerFilter: 'character',
  getEndpoint: (owner) => `/characters/${owner.characterId}/clones/`,
  fetchData: async (owner) => {
    const [clonesResult, implantsResult] = await Promise.all([
      esi.fetchWithMeta<ESIClone>(`/characters/${owner.characterId}/clones/`, {
        characterId: owner.characterId,
        schema: ESICloneSchema,
      }),
      esi.fetchWithMeta<number[]>(`/characters/${owner.characterId}/implants/`, {
        characterId: owner.characterId,
        schema: z.array(z.number()),
      }),
    ])
    return {
      data: { clones: clonesResult.data, activeImplants: implantsResult.data },
      expiresAt: clonesResult.expiresAt,
      etag: clonesResult.etag,
    }
  },
  toOwnerData: (owner, data) => ({
    owner,
    clones: data.clones,
    activeImplants: data.activeImplants,
  }),
})
