import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESICorporationStructureSchema } from '@/api/schemas'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESICorporationStructure = z.infer<typeof ESICorporationStructureSchema>

const ENDPOINT_PATTERN = '/structures'

export interface OwnerStructures {
  owner: Owner
  structures: ESICorporationStructure[]
}

interface StructuresState {
  structuresByOwner: OwnerStructures[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface StructuresActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type StructuresStore = StructuresState & StructuresActions

const db = createOwnerDB<ESICorporationStructure[]>({
  dbName: 'ecteveassets-structures',
  storeName: 'structures',
  dataKey: 'structures',
  moduleName: 'StructuresStore',
})

function getStructuresEndpoint(owner: Owner): string {
  return `/corporations/${owner.id}/structures`
}

async function fetchOwnerStructuresWithMeta(owner: Owner): Promise<ESIResponseMeta<ESICorporationStructure[]>> {
  const endpoint = getStructuresEndpoint(owner)
  return esi.fetchPaginatedWithMeta<ESICorporationStructure>(endpoint, {
    characterId: owner.characterId,
    schema: ESICorporationStructureSchema,
  })
}

export const useStructuresStore = create<StructuresStore>((set, get) => ({
  structuresByOwner: [],
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const structuresByOwner = loaded.map((d) => ({ owner: d.owner, structures: d.data }))
      set({ structuresByOwner, initialized: true })
      logger.info('Structures store initialized', {
        module: 'StructuresStore',
        owners: structuresByOwner.length,
        structures: structuresByOwner.reduce((sum, o) => sum + o.structures.length, 0),
      })
    } catch (err) {
      logger.error('Failed to load structures from DB', err instanceof Error ? err : undefined, {
        module: 'StructuresStore',
      })
      set({ initialized: true })
    }
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const owners = Object.values(useAuthStore.getState().owners)
    const corpOwners = owners.filter((o): o is Owner => o?.type === 'corporation' && !o.authFailed)

    if (corpOwners.length === 0) {
      logger.debug('No corporation owners for structures update', { module: 'StructuresStore' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? corpOwners
      : corpOwners.filter((owner) => {
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getStructuresEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need structures update', { module: 'StructuresStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingStructures = new Map(
        state.structuresByOwner.map((os) => [`${os.owner.type}-${os.owner.id}`, os])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getStructuresEndpoint(owner)

        try {
          logger.info('Fetching structures', { module: 'StructuresStore', owner: owner.name })
          const { data: structures, expiresAt, etag } = await fetchOwnerStructuresWithMeta(owner)

          await db.save(ownerKey, owner, structures)
          existingStructures.set(ownerKey, { owner, structures })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag, structures.length === 0)
        } catch (err) {
          logger.error('Failed to fetch structures', err instanceof Error ? err : undefined, {
            module: 'StructuresStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingStructures.values())

      set({
        structuresByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any structures' : null,
      })

      logger.info('Structures updated', {
        module: 'StructuresStore',
        owners: ownersToUpdate.length,
        totalStructures: results.reduce((sum, r) => sum + r.structures.length, 0),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Structures update failed', err instanceof Error ? err : undefined, {
        module: 'StructuresStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    if (owner.type !== 'corporation') return

    const state = get()

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getStructuresEndpoint(owner)

      logger.info('Fetching structures for owner', { module: 'StructuresStore', owner: owner.name })
      const { data: structures, expiresAt, etag } = await fetchOwnerStructuresWithMeta(owner)

      await db.save(ownerKey, owner, structures)
      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag, structures.length === 0)

      const updated = state.structuresByOwner.filter(
        (os) => `${os.owner.type}-${os.owner.id}` !== ownerKey
      )
      updated.push({ owner, structures })

      set({ structuresByOwner: updated })

      logger.info('Structures updated for owner', {
        module: 'StructuresStore',
        owner: owner.name,
        structures: structures.length,
      })
    } catch (err) {
      logger.error('Failed to fetch structures for owner', err instanceof Error ? err : undefined, {
        module: 'StructuresStore',
        owner: owner.name,
      })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.structuresByOwner.filter(
      (os) => `${os.owner.type}-${os.owner.id}` !== ownerKey
    )

    if (updated.length === state.structuresByOwner.length) return

    await db.delete(ownerKey)
    set({ structuresByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Structures removed for owner', { module: 'StructuresStore', ownerKey })
  },

  clear: async () => {
    await db.clear()
    set({
      structuresByOwner: [],
      updateError: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'StructuresStore', ownerKey: ownerKeyStr })
    return
  }
  await useStructuresStore.getState().updateForOwner(owner)
})
