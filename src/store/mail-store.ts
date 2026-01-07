import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESIMailHeaderSchema, ESIMailBodySchema } from '@/api/schemas'
import { type ESIMailHeader, type ESIMailBody } from '@/api/endpoints/mail'
import { z } from 'zod'

interface MailData {
  mails: ESIMailHeader[]
}

export interface CharacterMailData {
  owner: Owner
  mails: ESIMailHeader[]
}

interface MailBodyRecord {
  key: string
  body: ESIMailBody
}

const BODIES_STORE = 'bodies'

interface MailExtraState {
  bodyCache: Map<string, ESIMailBody>
}

interface MailExtraActions {
  getMailBody: (characterId: number, mailId: number) => Promise<ESIMailBody>
  clearMailBodies: () => Promise<void>
}

export const useMailStore = createOwnerStore<
  MailData,
  CharacterMailData,
  MailExtraState,
  MailExtraActions
>({
  name: 'mail',
  moduleName: 'MailStore',
  endpointPattern: '/mail',
  dbConfig: {
    dbName: 'ecteveassets-mail',
    storeName: 'mail',
    metaStoreName: 'meta',
    extraStores: [{ name: BODIES_STORE, keyPath: 'key' }],
    version: 2,
    serialize: (data: MailData) => ({ mails: data.mails }),
    deserialize: (stored: Record<string, unknown>) => ({
      mails: stored.mails as ESIMailHeader[],
    }),
  },
  ownerFilter: 'character',
  requiredScope: 'esi-mail.read_mail.v1',
  disableAutoRefresh: true,
  getEndpoint: (owner) => `/characters/${owner.characterId}/mail`,
  fetchData: async (owner) => {
    const result = await esi.fetchWithMeta<ESIMailHeader[]>(
      `/characters/${owner.characterId}/mail`,
      {
        characterId: owner.characterId,
        schema: z.array(ESIMailHeaderSchema),
      }
    )
    return {
      data: { mails: result.data },
      expiresAt: result.expiresAt,
      etag: result.etag,
    }
  },
  toOwnerData: (owner, data) => ({
    owner,
    mails: data.mails,
  }),
  extraState: {
    bodyCache: new Map(),
  },
  extraActions: (set, get, db) => ({
    getMailBody: async (characterId: number, mailId: number) => {
      const cacheKey = `${characterId}-${mailId}`

      const cached = get().bodyCache.get(cacheKey)
      if (cached) return cached

      const stored = await db.getFromExtra<MailBodyRecord>(
        BODIES_STORE,
        cacheKey
      )
      if (stored) {
        set({
          bodyCache: new Map(get().bodyCache).set(cacheKey, stored.body),
        })
        return stored.body
      }

      const body = await esi.fetch<ESIMailBody>(
        `/characters/${characterId}/mail/${mailId}`,
        { characterId, schema: ESIMailBodySchema }
      )

      await db.putToExtra<MailBodyRecord>(BODIES_STORE, {
        key: cacheKey,
        body,
      })

      set({
        bodyCache: new Map(get().bodyCache).set(cacheKey, body),
      })

      return body
    },

    clearMailBodies: async () => {
      await db.clearExtra(BODIES_STORE)
      set({ bodyCache: new Map() })
    },
  }),
})
