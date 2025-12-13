import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { useAssetStore } from './asset-store'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIIndustryJobSchema } from '@/api/schemas'
import { fetchPrices } from '@/api/ref-client'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIIndustryJob = z.infer<typeof ESIIndustryJobSchema>

const ENDPOINT_PATTERN = '/industry/jobs/'

export interface OwnerJobs {
  owner: Owner
  jobs: ESIIndustryJob[]
}

interface IndustryJobsState {
  jobsByOwner: OwnerJobs[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface IndustryJobsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type IndustryJobsStore = IndustryJobsState & IndustryJobsActions

const db = createOwnerDB<ESIIndustryJob[]>({
  dbName: 'ecteveassets-industry-jobs',
  storeName: 'jobs',
  dataKey: 'jobs',
  metaStoreName: 'meta',
  moduleName: 'IndustryJobsStore',
})

function getJobsEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/industry/jobs/`
  }
  return `/characters/${owner.characterId}/industry/jobs/`
}

async function fetchOwnerJobsWithMeta(owner: Owner): Promise<ESIResponseMeta<ESIIndustryJob[]>> {
  const endpoint = getJobsEndpoint(owner)
  if (owner.type === 'corporation') {
    return esi.fetchPaginatedWithMeta<ESIIndustryJob>(endpoint, {
      characterId: owner.characterId,
      schema: ESIIndustryJobSchema,
    })
  }
  return esi.fetchWithMeta<ESIIndustryJob[]>(endpoint, {
    characterId: owner.characterId,
    schema: z.array(ESIIndustryJobSchema),
  })
}

export const useIndustryJobsStore = create<IndustryJobsStore>((set, get) => ({
  jobsByOwner: [],
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const jobsByOwner = loaded.map((d) => ({ owner: d.owner, jobs: d.data }))
      set({ jobsByOwner, initialized: true })
      logger.info('Industry jobs store initialized', {
        module: 'IndustryJobsStore',
        owners: jobsByOwner.length,
        jobs: jobsByOwner.reduce((sum, o) => sum + o.jobs.length, 0),
      })
    } catch (err) {
      logger.error('Failed to load industry jobs from DB', err instanceof Error ? err : undefined, {
        module: 'IndustryJobsStore',
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
          const endpoint = getJobsEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need industry jobs update', { module: 'IndustryJobsStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingJobs = new Map(
        state.jobsByOwner.map((oj) => [`${oj.owner.type}-${oj.owner.id}`, oj])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getJobsEndpoint(owner)

        try {
          logger.info('Fetching industry jobs', { module: 'IndustryJobsStore', owner: owner.name })
          const { data: jobs, expiresAt, etag } = await fetchOwnerJobsWithMeta(owner)

          await db.save(ownerKey, owner, jobs)
          existingJobs.set(ownerKey, { owner, jobs })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag, jobs.length === 0)
        } catch (err) {
          logger.error('Failed to fetch industry jobs', err instanceof Error ? err : undefined, {
            module: 'IndustryJobsStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingJobs.values())

      const productTypeIds = new Set<number>()
      for (const { jobs } of results) {
        for (const job of jobs) {
          if (job.product_type_id) {
            productTypeIds.add(job.product_type_id)
          }
        }
      }

      if (productTypeIds.size > 0) {
        try {
          const prices = await fetchPrices(Array.from(productTypeIds))
          if (prices.size > 0) {
            await useAssetStore.getState().setPrices(prices)
          }
        } catch (err) {
          logger.error('Failed to fetch industry job prices', err instanceof Error ? err : undefined, {
            module: 'IndustryJobsStore',
          })
        }
      }

      set({
        jobsByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any jobs' : null,
      })

      logger.info('Industry jobs updated', {
        module: 'IndustryJobsStore',
        owners: ownersToUpdate.length,
        totalJobs: results.reduce((sum, r) => sum + r.jobs.length, 0),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Industry jobs update failed', err instanceof Error ? err : undefined, {
        module: 'IndustryJobsStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getJobsEndpoint(owner)

      logger.info('Fetching industry jobs for owner', { module: 'IndustryJobsStore', owner: owner.name })
      const { data: jobs, expiresAt, etag } = await fetchOwnerJobsWithMeta(owner)

      await db.save(ownerKey, owner, jobs)
      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag, jobs.length === 0)

      const productTypeIds = new Set<number>()
      for (const job of jobs) {
        if (job.product_type_id) {
          productTypeIds.add(job.product_type_id)
        }
      }

      if (productTypeIds.size > 0) {
        try {
          const prices = await fetchPrices(Array.from(productTypeIds))
          if (prices.size > 0) {
            await useAssetStore.getState().setPrices(prices)
          }
        } catch (err) {
          logger.error('Failed to fetch industry job prices', err instanceof Error ? err : undefined, {
            module: 'IndustryJobsStore',
          })
        }
      }

      const updated = state.jobsByOwner.filter(
        (oj) => `${oj.owner.type}-${oj.owner.id}` !== ownerKey
      )
      updated.push({ owner, jobs })

      set({ jobsByOwner: updated })

      logger.info('Industry jobs updated for owner', {
        module: 'IndustryJobsStore',
        owner: owner.name,
        jobs: jobs.length,
      })
    } catch (err) {
      logger.error('Failed to fetch industry jobs for owner', err instanceof Error ? err : undefined, {
        module: 'IndustryJobsStore',
        owner: owner.name,
      })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.jobsByOwner.filter(
      (oj) => `${oj.owner.type}-${oj.owner.id}` !== ownerKey
    )

    if (updated.length === state.jobsByOwner.length) return

    await db.delete(ownerKey)
    set({ jobsByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Industry jobs removed for owner', { module: 'IndustryJobsStore', ownerKey })
  },

  clear: async () => {
    await db.clear()
    set({
      jobsByOwner: [],
      updateError: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'IndustryJobsStore', ownerKey: ownerKeyStr })
    return
  }
  await useIndustryJobsStore.getState().updateForOwner(owner)
})
