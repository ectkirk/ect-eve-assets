import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIBlueprintSchema } from '@/api/schemas'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIBlueprint = z.infer<typeof ESIBlueprintSchema>

const ENDPOINT_PATTERN = '/blueprints/'

export interface OwnerBlueprints {
  owner: Owner
  blueprints: ESIBlueprint[]
}

export interface BlueprintInfo {
  materialEfficiency: number
  timeEfficiency: number
  runs: number
  isCopy: boolean
}

interface BlueprintsState {
  blueprintsByOwner: OwnerBlueprints[]
  blueprintsByItemId: Map<number, BlueprintInfo>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface BlueprintsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type BlueprintsStore = BlueprintsState & BlueprintsActions

const db = createOwnerDB<ESIBlueprint[]>({
  dbName: 'ecteveassets-blueprints',
  storeName: 'blueprints',
  dataKey: 'blueprints',
  metaStoreName: 'meta',
  moduleName: 'BlueprintsStore',
})

function getBlueprintsEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/blueprints/`
  }
  return `/characters/${owner.id}/blueprints/`
}

async function fetchOwnerBlueprintsWithMeta(owner: Owner): Promise<ESIResponseMeta<ESIBlueprint[]>> {
  const endpoint = getBlueprintsEndpoint(owner)
  return esi.fetchPaginatedWithMeta<ESIBlueprint>(endpoint, {
    characterId: owner.characterId,
    schema: ESIBlueprintSchema,
  })
}

function buildBlueprintMap(blueprintsByOwner: OwnerBlueprints[]): Map<number, BlueprintInfo> {
  const map = new Map<number, BlueprintInfo>()
  for (const { blueprints } of blueprintsByOwner) {
    for (const bp of blueprints) {
      map.set(bp.item_id, {
        materialEfficiency: bp.material_efficiency,
        timeEfficiency: bp.time_efficiency,
        runs: bp.runs,
        isCopy: bp.quantity === -2,
      })
    }
  }
  return map
}

export const useBlueprintsStore = create<BlueprintsStore>((set, get) => ({
  blueprintsByOwner: [],
  blueprintsByItemId: new Map(),
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const blueprintsByOwner = loaded.map((d) => ({ owner: d.owner, blueprints: d.data }))
      const blueprintsByItemId = buildBlueprintMap(blueprintsByOwner)
      set({ blueprintsByOwner, blueprintsByItemId, initialized: true })
      logger.info('Blueprints store initialized', {
        module: 'BlueprintsStore',
        owners: blueprintsByOwner.length,
        blueprints: blueprintsByItemId.size,
      })
    } catch (err) {
      logger.error('Failed to load blueprints from DB', err instanceof Error ? err : undefined, {
        module: 'BlueprintsStore',
      })
      set({ initialized: true })
    }
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? owners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : owners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getBlueprintsEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need blueprints update', { module: 'BlueprintsStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingBlueprints = new Map(
        state.blueprintsByOwner.map((ob) => [`${ob.owner.type}-${ob.owner.id}`, ob])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getBlueprintsEndpoint(owner)

        try {
          logger.info('Fetching blueprints', { module: 'BlueprintsStore', owner: owner.name })
          const { data: blueprints, expiresAt, etag } = await fetchOwnerBlueprintsWithMeta(owner)

          await db.save(ownerKey, owner, blueprints)
          existingBlueprints.set(ownerKey, { owner, blueprints })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)
        } catch (err) {
          logger.error('Failed to fetch blueprints', err instanceof Error ? err : undefined, {
            module: 'BlueprintsStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingBlueprints.values())

      const blueprintsByItemId = buildBlueprintMap(results)

      set({
        blueprintsByOwner: results,
        blueprintsByItemId,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any blueprints' : null,
      })

      logger.info('Blueprints updated', {
        module: 'BlueprintsStore',
        owners: ownersToUpdate.length,
        totalBlueprints: blueprintsByItemId.size,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Blueprints update failed', err instanceof Error ? err : undefined, {
        module: 'BlueprintsStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getBlueprintsEndpoint(owner)

      logger.info('Fetching blueprints for owner', { module: 'BlueprintsStore', owner: owner.name })
      const { data: blueprints, expiresAt, etag } = await fetchOwnerBlueprintsWithMeta(owner)

      await db.save(ownerKey, owner, blueprints)
      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)

      const updated = state.blueprintsByOwner.filter(
        (ob) => `${ob.owner.type}-${ob.owner.id}` !== ownerKey
      )
      updated.push({ owner, blueprints })

      const blueprintsByItemId = buildBlueprintMap(updated)

      set({ blueprintsByOwner: updated, blueprintsByItemId })

      logger.info('Blueprints updated for owner', {
        module: 'BlueprintsStore',
        owner: owner.name,
        blueprints: blueprints.length,
      })
    } catch (err) {
      logger.error('Failed to fetch blueprints for owner', err instanceof Error ? err : undefined, {
        module: 'BlueprintsStore',
        owner: owner.name,
      })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.blueprintsByOwner.filter(
      (ob) => `${ob.owner.type}-${ob.owner.id}` !== ownerKey
    )

    if (updated.length === state.blueprintsByOwner.length) return

    await db.delete(ownerKey)
    const blueprintsByItemId = buildBlueprintMap(updated)
    set({ blueprintsByOwner: updated, blueprintsByItemId })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Blueprints removed for owner', { module: 'BlueprintsStore', ownerKey })
  },

  clear: async () => {
    await db.clear()
    set({
      blueprintsByOwner: [],
      blueprintsByItemId: new Map(),
      updateError: null,
      initialized: false,
    })
  },
}))

export function getBlueprintInfo(itemId: number): BlueprintInfo | undefined {
  return useBlueprintsStore.getState().blueprintsByItemId.get(itemId)
}

export function formatBlueprintName(baseName: string, itemId: number): string {
  const info = getBlueprintInfo(itemId)
  if (!info) return baseName

  if (info.isCopy) {
    return `${baseName} (ME${info.materialEfficiency} TE${info.timeEfficiency} R${info.runs})`
  }
  return `${baseName} (ME${info.materialEfficiency} TE${info.timeEfficiency})`
}

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'BlueprintsStore', ownerKey: ownerKeyStr })
    return
  }
  await useBlueprintsStore.getState().updateForOwner(owner)
})
