import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESICloneSchema } from '@/api/schemas'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIClone = z.infer<typeof ESICloneSchema>

const ENDPOINT_PATTERN = '/clones/'

interface CloneData {
  clones: ESIClone
  activeImplants: number[]
}

export interface CharacterCloneData {
  owner: Owner
  clones: ESIClone
  activeImplants: number[]
}

interface ClonesState {
  clonesByOwner: CharacterCloneData[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface ClonesActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type ClonesStore = ClonesState & ClonesActions

const db = createOwnerDB<CloneData>({
  dbName: 'ecteveassets-clones',
  storeName: 'clones',
  metaStoreName: 'meta',
  moduleName: 'ClonesStore',
  serialize: (data) => ({ clones: data.clones, activeImplants: data.activeImplants }),
  deserialize: (stored) => ({
    clones: stored.clones as ESIClone,
    activeImplants: stored.activeImplants as number[],
  }),
})

function getClonesEndpoint(owner: Owner): string {
  return `/characters/${owner.characterId}/clones/`
}

async function fetchClonesWithMeta(owner: Owner): Promise<ESIResponseMeta<ESIClone>> {
  const endpoint = getClonesEndpoint(owner)
  return esi.fetchWithMeta<ESIClone>(endpoint, {
    characterId: owner.characterId,
    schema: ESICloneSchema,
  })
}

async function fetchImplantsWithMeta(owner: Owner): Promise<ESIResponseMeta<number[]>> {
  return esi.fetchWithMeta<number[]>(`/characters/${owner.characterId}/implants/`, {
    characterId: owner.characterId,
    schema: z.array(z.number()),
  })
}

export const useClonesStore = create<ClonesStore>((set, get) => ({
  clonesByOwner: [],
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const clonesByOwner = loaded.map((d) => ({
        owner: d.owner,
        clones: d.data.clones,
        activeImplants: d.data.activeImplants,
      }))
      set({ clonesByOwner, initialized: true })
      logger.info('Clones store initialized', {
        module: 'ClonesStore',
        owners: clonesByOwner.length,
      })
    } catch (err) {
      logger.error('Failed to load clones from DB', err instanceof Error ? err : undefined, {
        module: 'ClonesStore',
      })
      set({ initialized: true })
    }
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const allOwners = Object.values(useAuthStore.getState().owners).filter(
      (o) => o.type === 'character'
    )
    if (allOwners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? allOwners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : allOwners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getClonesEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need clones update', { module: 'ClonesStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingClones = new Map(
        state.clonesByOwner.map((oc) => [`${oc.owner.type}-${oc.owner.id}`, oc])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getClonesEndpoint(owner)

        try {
          logger.info('Fetching clones', { module: 'ClonesStore', owner: owner.name })
          const [clonesResult, implantsResult] = await Promise.all([
            fetchClonesWithMeta(owner),
            fetchImplantsWithMeta(owner),
          ])

          await db.save(ownerKey, owner, { clones: clonesResult.data, activeImplants: implantsResult.data })
          existingClones.set(ownerKey, {
            owner,
            clones: clonesResult.data,
            activeImplants: implantsResult.data,
          })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, clonesResult.expiresAt, clonesResult.etag, true)
        } catch (err) {
          logger.error('Failed to fetch clones', err instanceof Error ? err : undefined, {
            module: 'ClonesStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingClones.values())

      set({
        clonesByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any clones' : null,
      })

      logger.info('Clones updated', {
        module: 'ClonesStore',
        owners: ownersToUpdate.length,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Clones update failed', err instanceof Error ? err : undefined, {
        module: 'ClonesStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    if (owner.type !== 'character') return

    const state = get()

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getClonesEndpoint(owner)

      logger.info('Fetching clones for owner', { module: 'ClonesStore', owner: owner.name })

      const [clonesResult, implantsResult] = await Promise.all([
        fetchClonesWithMeta(owner),
        fetchImplantsWithMeta(owner),
      ])

      await db.save(ownerKey, owner, { clones: clonesResult.data, activeImplants: implantsResult.data })
      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, clonesResult.expiresAt, clonesResult.etag, true)

      const updated = state.clonesByOwner.filter(
        (oc) => `${oc.owner.type}-${oc.owner.id}` !== ownerKey
      )
      updated.push({ owner, clones: clonesResult.data, activeImplants: implantsResult.data })

      set({ clonesByOwner: updated })

      logger.info('Clones updated for owner', {
        module: 'ClonesStore',
        owner: owner.name,
      })
    } catch (err) {
      logger.error('Failed to fetch clones for owner', err instanceof Error ? err : undefined, {
        module: 'ClonesStore',
        owner: owner.name,
      })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.clonesByOwner.filter(
      (oc) => `${oc.owner.type}-${oc.owner.id}` !== ownerKey
    )

    if (updated.length === state.clonesByOwner.length) return

    await db.delete(ownerKey)
    set({ clonesByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Clones removed for owner', { module: 'ClonesStore', ownerKey })
  },

  clear: async () => {
    await db.clear()
    set({
      clonesByOwner: [],
      updateError: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'ClonesStore', ownerKey: ownerKeyStr })
    return
  }
  await useClonesStore.getState().updateForOwner(owner)
})
