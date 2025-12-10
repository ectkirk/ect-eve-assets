import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import {
  getCharacterIndustryJobs,
  getCorporationIndustryJobs,
  type ESIIndustryJob,
} from '@/api/endpoints/industry'
import { logger } from '@/lib/logger'

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
  lastUpdated: number | null
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

const UPDATE_COOLDOWN_MS = 5 * 60 * 1000

interface IndustryJobsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
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
        database.createObjectStore(STORE_JOBS, { keyPath: 'ownerKey' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<{
  jobsByOwner: OwnerJobs[]
  lastUpdated: number | null
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_JOBS, STORE_META], 'readonly')
    const jobsStore = tx.objectStore(STORE_JOBS)
    const metaStore = tx.objectStore(STORE_META)

    const jobsByOwner: OwnerJobs[] = []
    const jobsRequest = jobsStore.getAll()
    const metaRequest = metaStore.getAll()

    tx.oncomplete = () => {
      for (const stored of jobsRequest.result as StoredOwnerJobs[]) {
        jobsByOwner.push({ owner: stored.owner, jobs: stored.jobs })
      }

      let lastUpdated: number | null = null
      for (const meta of metaRequest.result) {
        if (meta.key === 'lastUpdated') lastUpdated = meta.value
      }

      resolve({ jobsByOwner, lastUpdated })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(jobsByOwner: OwnerJobs[], lastUpdated: number): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_JOBS, STORE_META], 'readwrite')
    const jobsStore = tx.objectStore(STORE_JOBS)
    const metaStore = tx.objectStore(STORE_META)

    jobsStore.clear()
    for (const { owner, jobs } of jobsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      jobsStore.put({ ownerKey, owner, jobs } as StoredOwnerJobs)
    }

    metaStore.put({ key: 'lastUpdated', value: lastUpdated })

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
  lastUpdated: null,
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { jobsByOwner, lastUpdated } = await loadFromDB()
      set({ jobsByOwner, lastUpdated, initialized: true })
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

  canUpdate: () => {
    const { lastUpdated, isUpdating } = get()
    if (isUpdating) return false
    if (!lastUpdated) return true
    return Date.now() - lastUpdated >= UPDATE_COOLDOWN_MS
  },

  getTimeUntilUpdate: () => {
    const { lastUpdated } = get()
    if (!lastUpdated) return 0
    const elapsed = Date.now() - lastUpdated
    const remaining = UPDATE_COOLDOWN_MS - elapsed
    return remaining > 0 ? remaining : 0
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    if (!force && state.lastUpdated && Date.now() - state.lastUpdated < UPDATE_COOLDOWN_MS) {
      const minutes = Math.ceil((UPDATE_COOLDOWN_MS - (Date.now() - state.lastUpdated)) / 60000)
      set({ updateError: `Update available in ${minutes} minute${minutes === 1 ? '' : 's'}` })
      return
    }

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const results: OwnerJobs[] = []

      for (const owner of owners) {
        try {
          logger.info('Fetching industry jobs', {
            module: 'IndustryJobsStore',
            owner: owner.name,
            type: owner.type,
          })

          let jobs: ESIIndustryJob[] = []

          if (owner.type === 'corporation') {
            jobs = await getCorporationIndustryJobs(owner.characterId, owner.id)
          } else {
            jobs = await getCharacterIndustryJobs(owner.characterId)
          }

          logger.debug('Industry jobs fetched', {
            module: 'IndustryJobsStore',
            owner: owner.name,
            type: owner.type,
            count: jobs.length,
          })

          results.push({ owner, jobs })
        } catch (err) {
          logger.error('Failed to fetch industry jobs', err instanceof Error ? err : undefined, {
            module: 'IndustryJobsStore',
            owner: owner.name,
          })
        }
      }

      const lastUpdated = Date.now()
      await saveToDB(results, lastUpdated)

      set({
        jobsByOwner: results,
        lastUpdated,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any jobs' : null,
      })

      logger.info('Industry jobs updated', {
        module: 'IndustryJobsStore',
        owners: results.length,
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
      logger.info('Fetching industry jobs for new owner', { module: 'IndustryJobsStore', owner: owner.name })

      let jobs: ESIIndustryJob[]
      if (owner.type === 'character') {
        jobs = await getCharacterIndustryJobs(owner.characterId)
      } else {
        jobs = await getCorporationIndustryJobs(owner.characterId, owner.id)
      }

      const ownerKey = `${owner.type}-${owner.id}`
      const updated = state.jobsByOwner.filter(
        (oj) => `${oj.owner.type}-${oj.owner.id}` !== ownerKey
      )
      updated.push({ owner, jobs })

      const lastUpdated = Date.now()
      await saveToDB(updated, lastUpdated)

      set({ jobsByOwner: updated, lastUpdated })

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

  clear: async () => {
    await clearDB()
    set({
      jobsByOwner: [],
      lastUpdated: null,
      updateError: null,
    })
  },
}))
