import { create } from 'zustand'
import { useAuthStore, type Owner, type OwnerType, ownerKey, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { useAssetStore } from './asset-store'
import { esi } from '@/api/esi'
import { ESIIndustryJobSchema } from '@/api/schemas'
import { queuePriceRefresh } from '@/api/ref-client'
import { logger } from '@/lib/logger'
import { triggerResolution } from '@/lib/data-resolver'
import { z } from 'zod'

export type ESIIndustryJob = z.infer<typeof ESIIndustryJobSchema>

const DB_NAME = 'ecteveassets-industry-jobs-v2'
const OLD_DB_NAME = 'ecteveassets-industry-jobs'
const DB_VERSION = 1
const STORE_JOBS = 'jobs'
const STORE_VISIBILITY = 'visibility'

interface SourceOwner {
  type: OwnerType
  id: number
  characterId: number
}

export interface StoredJob {
  job: ESIIndustryJob
  sourceOwner: SourceOwner
}

export interface OwnerJobs {
  owner: Owner
  jobs: ESIIndustryJob[]
}

interface IndustryJobsState {
  jobsById: Map<number, StoredJob>
  visibilityByOwner: Map<string, Set<number>>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
  updateCounter: number
}

interface IndustryJobsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  getTotal: (prices: Map<number, number>, selectedOwnerIds: string[]) => number
  getJobsByOwner: () => OwnerJobs[]
}

type IndustryJobsStore = IndustryJobsState & IndustryJobsActions

let db: IDBDatabase | null = null

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
        database.createObjectStore(STORE_JOBS, { keyPath: 'jobId' })
      }
      if (!database.objectStoreNames.contains(STORE_VISIBILITY)) {
        database.createObjectStore(STORE_VISIBILITY, { keyPath: 'ownerKey' })
      }
    }
  })
}

interface StoredJobRecord {
  jobId: number
  job: ESIIndustryJob
  sourceOwner: SourceOwner
}

interface VisibilityRecord {
  ownerKey: string
  jobIds: number[]
}

async function loadFromDB(): Promise<{
  jobs: Map<number, StoredJob>
  visibility: Map<string, Set<number>>
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_JOBS, STORE_VISIBILITY], 'readonly')
    const jobsStore = tx.objectStore(STORE_JOBS)
    const visibilityStore = tx.objectStore(STORE_VISIBILITY)

    const jobsRequest = jobsStore.getAll()
    const visibilityRequest = visibilityStore.getAll()

    tx.oncomplete = () => {
      const jobs = new Map<number, StoredJob>()
      for (const record of jobsRequest.result as StoredJobRecord[]) {
        jobs.set(record.jobId, {
          job: record.job,
          sourceOwner: record.sourceOwner,
        })
      }

      const visibility = new Map<string, Set<number>>()
      for (const record of visibilityRequest.result as VisibilityRecord[]) {
        visibility.set(record.ownerKey, new Set(record.jobIds))
      }

      resolve({ jobs, visibility })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveJobToDB(jobId: number, stored: StoredJob): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_JOBS], 'readwrite')
    const store = tx.objectStore(STORE_JOBS)
    store.put({
      jobId,
      job: stored.job,
      sourceOwner: stored.sourceOwner,
    } as StoredJobRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function saveVisibilityToDB(ownerKeyStr: string, jobIds: Set<number>): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_VISIBILITY], 'readwrite')
    const store = tx.objectStore(STORE_VISIBILITY)
    store.put({
      ownerKey: ownerKeyStr,
      jobIds: [...jobIds],
    } as VisibilityRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteVisibilityFromDB(ownerKeyStr: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_VISIBILITY], 'readwrite')
    const store = tx.objectStore(STORE_VISIBILITY)
    store.delete(ownerKeyStr)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_JOBS, STORE_VISIBILITY], 'readwrite')
    tx.objectStore(STORE_JOBS).clear()
    tx.objectStore(STORE_VISIBILITY).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function migrateFromOldDB(): Promise<{
  jobs: Map<number, StoredJob>
  visibility: Map<string, Set<number>>
} | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(OLD_DB_NAME)

    request.onerror = () => {
      resolve(null)
    }

    request.onsuccess = () => {
      const oldDb = request.result
      if (!oldDb.objectStoreNames.contains('jobs')) {
        oldDb.close()
        resolve(null)
        return
      }

      const tx = oldDb.transaction(['jobs'], 'readonly')
      const store = tx.objectStore('jobs')
      const getAllRequest = store.getAll()

      tx.oncomplete = async () => {
        const oldData = getAllRequest.result as Array<{
          key: string
          owner: Owner
          jobs: ESIIndustryJob[]
        }>

        if (!oldData || oldData.length === 0) {
          oldDb.close()
          resolve(null)
          return
        }

        const jobs = new Map<number, StoredJob>()
        const visibility = new Map<string, Set<number>>()

        for (const entry of oldData) {
          if (!Array.isArray(entry.jobs)) continue

          const ownerKeyStr = ownerKey(entry.owner.type, entry.owner.id)
          const ownerVisibility = new Set<number>()

          for (const job of entry.jobs) {
            ownerVisibility.add(job.job_id)

            if (!jobs.has(job.job_id)) {
              jobs.set(job.job_id, {
                job,
                sourceOwner: {
                  type: entry.owner.type,
                  id: entry.owner.id,
                  characterId: entry.owner.characterId,
                },
              })
            }
          }

          visibility.set(ownerKeyStr, ownerVisibility)
        }

        oldDb.close()

        try {
          indexedDB.deleteDatabase(OLD_DB_NAME)
          logger.info('Migrated industry jobs from old DB format', {
            module: 'IndustryJobsStore',
            jobs: jobs.size,
            owners: visibility.size,
          })
        } catch {
          logger.warn('Failed to delete old industry jobs DB', { module: 'IndustryJobsStore' })
        }

        resolve({ jobs, visibility })
      }

      tx.onerror = () => {
        oldDb.close()
        resolve(null)
      }
    }
  })
}

function getEndpoint(owner: Owner): string {
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/industry/jobs/`
    : `/characters/${owner.characterId}/industry/jobs/`
}

async function fetchJobsForOwner(owner: Owner): Promise<{
  data: ESIIndustryJob[]
  expiresAt: number
  etag: string | null
}> {
  const endpoint = getEndpoint(owner)

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

async function fetchProductPrices(jobs: ESIIndustryJob[]): Promise<void> {
  const existingPrices = useAssetStore.getState().prices
  const deltaTypeIds: number[] = []

  for (const job of jobs) {
    if (job.product_type_id && !existingPrices.has(job.product_type_id)) {
      deltaTypeIds.push(job.product_type_id)
    }
  }

  if (deltaTypeIds.length === 0) return

  try {
    const prices = await queuePriceRefresh(deltaTypeIds)
    if (prices.size > 0) {
      await useAssetStore.getState().setPrices(prices)
    }
  } catch (err) {
    logger.error('Failed to fetch industry job prices', err instanceof Error ? err : undefined, {
      module: 'IndustryJobsStore',
    })
  }
}

export const useIndustryJobsStore = create<IndustryJobsStore>((set, get) => ({
  jobsById: new Map(),
  visibilityByOwner: new Map(),
  isUpdating: false,
  updateError: null,
  initialized: false,
  updateCounter: 0,

  init: async () => {
    if (get().initialized) return

    try {
      let { jobs, visibility } = await loadFromDB()

      if (jobs.size === 0) {
        const migrated = await migrateFromOldDB()
        if (migrated) {
          jobs = migrated.jobs
          visibility = migrated.visibility

          for (const [jobId, stored] of jobs) {
            await saveJobToDB(jobId, stored)
          }
          for (const [ownerKeyStr, jobIds] of visibility) {
            await saveVisibilityToDB(ownerKeyStr, jobIds)
          }
        }
      }

      set({
        jobsById: jobs,
        visibilityByOwner: visibility,
        initialized: true,
      })

      if (jobs.size > 0) {
        triggerResolution()
      }

      logger.info('Industry jobs store initialized', {
        module: 'IndustryJobsStore',
        jobs: jobs.size,
        owners: visibility.size,
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
    if (!state.initialized) {
      await get().init()
    }
    if (get().isUpdating) return

    const allOwners = Object.values(useAuthStore.getState().owners)
    if (allOwners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? allOwners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : allOwners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const key = `${owner.type}-${owner.id}`
          const endpoint = getEndpoint(owner)
          return expiryCacheStore.isExpired(key, endpoint)
        })

    if (ownersToUpdate.length === 0) return

    set({ isUpdating: true, updateError: null })

    try {
      const jobsById = new Map(get().jobsById)
      const visibilityByOwner = new Map(get().visibilityByOwner)

      for (const owner of ownersToUpdate) {
        const currentOwnerKey = ownerKey(owner.type, owner.id)
        const endpoint = getEndpoint(owner)

        try {
          logger.info('Fetching industry jobs', { module: 'IndustryJobsStore', owner: owner.name })

          const { data: jobs, expiresAt, etag } = await fetchJobsForOwner(owner)

          await fetchProductPrices(jobs)

          const ownerVisibility = new Set<number>()

          for (const job of jobs) {
            ownerVisibility.add(job.job_id)

            if (!jobsById.has(job.job_id)) {
              const stored: StoredJob = {
                job,
                sourceOwner: { type: owner.type, id: owner.id, characterId: owner.characterId },
              }
              jobsById.set(job.job_id, stored)
              await saveJobToDB(job.job_id, stored)
            } else {
              const existing = jobsById.get(job.job_id)!
              existing.job = job
              await saveJobToDB(job.job_id, existing)
            }
          }

          visibilityByOwner.set(currentOwnerKey, ownerVisibility)
          await saveVisibilityToDB(currentOwnerKey, ownerVisibility)

          useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, jobs.length === 0)
        } catch (err) {
          logger.error('Failed to fetch industry jobs', err instanceof Error ? err : undefined, {
            module: 'IndustryJobsStore',
            owner: owner.name,
          })
        }
      }

      set((s) => ({
        jobsById,
        visibilityByOwner,
        isUpdating: false,
        updateError: jobsById.size === 0 ? 'Failed to fetch any industry jobs' : null,
        updateCounter: s.updateCounter + 1,
      }))

      triggerResolution()

      logger.info('Industry jobs updated', {
        module: 'IndustryJobsStore',
        owners: ownersToUpdate.length,
        totalJobs: jobsById.size,
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
    if (!state.initialized) {
      await get().init()
    }

    try {
      const currentOwnerKey = ownerKey(owner.type, owner.id)
      const endpoint = getEndpoint(owner)

      logger.info('Fetching industry jobs for owner', { module: 'IndustryJobsStore', owner: owner.name })

      const { data: jobs, expiresAt, etag } = await fetchJobsForOwner(owner)

      await fetchProductPrices(jobs)

      const jobsById = new Map(state.jobsById)
      const visibilityByOwner = new Map(state.visibilityByOwner)

      const ownerVisibility = new Set<number>()

      for (const job of jobs) {
        ownerVisibility.add(job.job_id)

        if (!jobsById.has(job.job_id)) {
          const stored: StoredJob = {
            job,
            sourceOwner: { type: owner.type, id: owner.id, characterId: owner.characterId },
          }
          jobsById.set(job.job_id, stored)
          await saveJobToDB(job.job_id, stored)
        } else {
          const existing = jobsById.get(job.job_id)!
          existing.job = job
          await saveJobToDB(job.job_id, existing)
        }
      }

      visibilityByOwner.set(currentOwnerKey, ownerVisibility)
      await saveVisibilityToDB(currentOwnerKey, ownerVisibility)

      useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, jobs.length === 0)

      set((s) => ({
        jobsById,
        visibilityByOwner,
        updateCounter: s.updateCounter + 1,
      }))

      triggerResolution()

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
    const currentOwnerKey = `${ownerType}-${ownerId}`

    if (!state.visibilityByOwner.has(currentOwnerKey)) return

    const visibilityByOwner = new Map(state.visibilityByOwner)
    visibilityByOwner.delete(currentOwnerKey)

    await deleteVisibilityFromDB(currentOwnerKey)

    set({ visibilityByOwner })

    useExpiryCacheStore.getState().clearForOwner(currentOwnerKey)

    logger.info('Industry jobs removed for owner', { module: 'IndustryJobsStore', ownerKey: currentOwnerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      jobsById: new Map(),
      visibilityByOwner: new Map(),
      updateError: null,
      initialized: false,
    })
  },

  getTotal: (prices, selectedOwnerIds) => {
    const state = get()
    const selectedSet = new Set(selectedOwnerIds)

    const visibleJobIds = new Set<number>()
    for (const [key, jobIds] of state.visibilityByOwner) {
      if (selectedSet.has(key)) {
        for (const id of jobIds) {
          visibleJobIds.add(id)
        }
      }
    }

    let total = 0
    for (const jobId of visibleJobIds) {
      const stored = state.jobsById.get(jobId)
      if (!stored) continue

      const { job } = stored
      if (job.status !== 'active' && job.status !== 'ready') continue

      const productTypeId = job.product_type_id ?? job.blueprint_type_id
      total += (prices.get(productTypeId) ?? 0) * job.runs
    }
    return total
  },

  getJobsByOwner: () => {
    const state = get()
    const result: OwnerJobs[] = []

    for (const [ownerKeyStr, jobIds] of state.visibilityByOwner) {
      const owner = findOwnerByKey(ownerKeyStr)
      if (!owner) continue

      const jobs: ESIIndustryJob[] = []
      for (const jobId of jobIds) {
        const stored = state.jobsById.get(jobId)
        if (stored) {
          jobs.push(stored.job)
        }
      }

      result.push({ owner, jobs })
    }

    return result
  },
}))
