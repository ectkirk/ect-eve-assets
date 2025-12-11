import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIIndustryJobSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIIndustryJob = z.infer<typeof ESIIndustryJobSchema>

const DB_NAME = 'ecteveassets-industry-jobs'
const DB_VERSION = 1
const STORE_JOBS = 'jobs'
const STORE_META = 'meta'

export interface OwnerJobs {
  owner: Owner
  jobs: ESIIndustryJob[]
}

interface StoredOwnerJobs {
  ownerKey: string
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

let db: IDBDatabase | null = null

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

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open industry jobs DB', request.error, { module: 'IndustryJobsStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_JOBS)) {
        database.createObjectStore(STORE_JOBS, { keyPath: 'ownerKey' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<{ jobsByOwner: OwnerJobs[] }> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_JOBS], 'readonly')
    const jobsStore = tx.objectStore(STORE_JOBS)

    const jobsByOwner: OwnerJobs[] = []
    const jobsRequest = jobsStore.getAll()

    tx.oncomplete = () => {
      for (const stored of jobsRequest.result as StoredOwnerJobs[]) {
        jobsByOwner.push({ owner: stored.owner, jobs: stored.jobs })
      }
      resolve({ jobsByOwner })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(jobsByOwner: OwnerJobs[]): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_JOBS], 'readwrite')
    const jobsStore = tx.objectStore(STORE_JOBS)

    jobsStore.clear()
    for (const { owner, jobs } of jobsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      jobsStore.put({ ownerKey, owner, jobs } as StoredOwnerJobs)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_JOBS, STORE_META], 'readwrite')
    tx.objectStore(STORE_JOBS).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
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
      const { jobsByOwner } = await loadFromDB()
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

          existingJobs.set(ownerKey, { owner, jobs })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)
        } catch (err) {
          logger.error('Failed to fetch industry jobs', err instanceof Error ? err : undefined, {
            module: 'IndustryJobsStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingJobs.values())
      await saveToDB(results)

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

      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)

      const updated = state.jobsByOwner.filter(
        (oj) => `${oj.owner.type}-${oj.owner.id}` !== ownerKey
      )
      updated.push({ owner, jobs })

      await saveToDB(updated)

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

    await saveToDB(updated)
    set({ jobsByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Industry jobs removed for owner', { module: 'IndustryJobsStore', ownerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      jobsByOwner: [],
      updateError: null,
    })
  },
}))
