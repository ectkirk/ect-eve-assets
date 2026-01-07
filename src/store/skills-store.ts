import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESICharacterSkillsSchema } from '@/api/schemas'
import { z } from 'zod'

export type ESICharacterSkills = z.infer<typeof ESICharacterSkillsSchema>

interface SkillsData {
  skills: ESICharacterSkills
}

export interface CharacterSkillsData {
  owner: Owner
  skills: ESICharacterSkills
}

export const useSkillsStore = createOwnerStore<SkillsData, CharacterSkillsData>(
  {
    name: 'skills',
    moduleName: 'SkillsStore',
    endpointPattern: '/skills',
    dbConfig: {
      dbName: 'ecteveassets-skills',
      storeName: 'skills',
      metaStoreName: 'meta',
      serialize: (data) => ({ skills: data.skills }),
      deserialize: (stored) => ({
        skills: stored.skills as ESICharacterSkills,
      }),
    },
    ownerFilter: 'character',
    disableAutoRefresh: true,
    getEndpoint: (owner) => `/characters/${owner.characterId}/skills`,
    fetchData: async (owner) => {
      const result = await esi.fetchWithMeta<ESICharacterSkills>(
        `/characters/${owner.characterId}/skills`,
        {
          characterId: owner.characterId,
          schema: ESICharacterSkillsSchema,
        }
      )
      return {
        data: { skills: result.data },
        expiresAt: result.expiresAt,
        etag: result.etag,
      }
    },
    toOwnerData: (owner, data) => ({
      owner,
      skills: data.skills,
    }),
  }
)
