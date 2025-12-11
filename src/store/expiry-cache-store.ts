import { create } from 'zustand'
import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-expiry'
const DB_VERSION = 1
const STORE_EXPIRY = 'expiry'

export interface EndpointExpiry {
  expiresAt: number
  etag: string | null
}

interface StoredExpiry {
  key: string
  expiresAt: number
  etag: string | null
}

type RefreshCallback = (ownerKey: string, endpoint: string) => Promise<void>

interface ExpiryCacheState {
  endpoints: Map<string, EndpointExpiry>
  initialized: boolean
}

interface ExpiryCacheActions {
  init: () => Promise<void>
  setExpiry: (ownerKey: string, endpoint: string, expiresAt: number, etag?: string | null) => void
  getExpiry: (ownerKey: string, endpoint: string) => EndpointExpiry | undefined
  isExpired: (ownerKey: string, endpoint: string) => boolean
  registerRefreshCallback: (endpointPattern: string, callback: RefreshCallback) => () => void
  triggerRefresh: (ownerKey: string, endpoint: string) => void
  queueInitialRefresh: (ownerKey: string, endpoint: string) => void
  queueAllEndpointsForOwner: (ownerKey: string) => void
  queueMissingEndpoints: (ownerKeys: string[]) => void
  clearForOwner: (ownerKey: string) => void
  clear: () => Promise<void>
}

type ExpiryCacheStore = ExpiryCacheState & ExpiryCacheActions

let db: IDBDatabase | null = null

const timers = new Map<string, NodeJS.Timeout>()
const callbacks = new Map<string, RefreshCallback>()
const initialQueue: Array<{ ownerKey: string; endpoint: string }> = []
let processingQueuePromise: Promise<void> | null = null

function makeKey(ownerKey: string, endpoint: string): string {
  return `${ownerKey}:${endpoint}`
}

function findCallbackForEndpoint(endpoint: string): RefreshCallback | undefined {
  for (const [pattern, callback] of callbacks) {
    if (endpoint.includes(pattern)) {
      return callback
    }
  }
  return undefined
}

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open expiry cache DB', request.error, { module: 'ExpiryCacheStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      if (!database.objectStoreNames.contains(STORE_EXPIRY)) {
        database.createObjectStore(STORE_EXPIRY, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<Map<string, EndpointExpiry>> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_EXPIRY], 'readonly')
    const store = tx.objectStore(STORE_EXPIRY)
    const request = store.getAll()

    tx.oncomplete = () => {
      const endpoints = new Map<string, EndpointExpiry>()
      for (const stored of request.result as StoredExpiry[]) {
        endpoints.set(stored.key, { expiresAt: stored.expiresAt, etag: stored.etag })
      }
      resolve(endpoints)
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(key: string, expiry: EndpointExpiry): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_EXPIRY], 'readwrite')
    const store = tx.objectStore(STORE_EXPIRY)

    store.put({ key, expiresAt: expiry.expiresAt, etag: expiry.etag } as StoredExpiry)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteByPrefixFromDB(prefix: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_EXPIRY], 'readwrite')
    const store = tx.objectStore(STORE_EXPIRY)
    const request = store.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        if ((cursor.key as string).startsWith(prefix)) {
          cursor.delete()
        }
        cursor.continue()
      }
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_EXPIRY], 'readwrite')
    tx.objectStore(STORE_EXPIRY).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function scheduleTimer(key: string, ownerKey: string, endpoint: string, expiresAt: number) {
  const existingTimer = timers.get(key)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const delay = Math.max(100, expiresAt - Date.now())

  const timer = setTimeout(() => {
    timers.delete(key)
    const callback = findCallbackForEndpoint(endpoint)
    if (callback) {
      logger.debug('Timer fired, triggering refresh', { module: 'ExpiryCacheStore', ownerKey, endpoint })
      callback(ownerKey, endpoint).catch((err) => {
        logger.error('Refresh callback failed', err instanceof Error ? err : undefined, {
          module: 'ExpiryCacheStore',
          ownerKey,
          endpoint,
        })
      })
    }
  }, delay)

  timers.set(key, timer)

  logger.debug('Scheduled refresh', {
    module: 'ExpiryCacheStore',
    ownerKey,
    endpoint,
    delayMs: delay,
  })
}

async function doProcessQueue(): Promise<void> {
  logger.info('Processing initial refresh queue', {
    module: 'ExpiryCacheStore',
    count: initialQueue.length,
  })

  while (initialQueue.length > 0) {
    const item = initialQueue.shift()
    if (!item) continue

    const callback = findCallbackForEndpoint(item.endpoint)
    if (callback) {
      try {
        await callback(item.ownerKey, item.endpoint)
      } catch (err) {
        logger.error('Initial refresh failed', err instanceof Error ? err : undefined, {
          module: 'ExpiryCacheStore',
          ownerKey: item.ownerKey,
          endpoint: item.endpoint,
        })
      }
    }
  }
}

function processInitialQueue() {
  if (processingQueuePromise || initialQueue.length === 0) return
  processingQueuePromise = doProcessQueue().finally(() => {
    processingQueuePromise = null
  })
}

export const useExpiryCacheStore = create<ExpiryCacheStore>((set, get) => ({
  endpoints: new Map(),
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const endpoints = await loadFromDB()
      set({ endpoints, initialized: true })

      const now = Date.now()
      const expiredEntries: Array<{ ownerKey: string; endpoint: string }> = []

      for (const [key, expiry] of endpoints) {
        const colonIdx = key.indexOf(':')
        if (colonIdx === -1) continue
        const ownerKey = key.slice(0, colonIdx)
        const endpoint = key.slice(colonIdx + 1)

        if (expiry.expiresAt > now) {
          scheduleTimer(key, ownerKey, endpoint, expiry.expiresAt)
        } else {
          expiredEntries.push({ ownerKey, endpoint })
        }
      }

      logger.info('Expiry cache initialized', { module: 'ExpiryCacheStore', count: endpoints.size, expired: expiredEntries.length })

      for (const { ownerKey, endpoint } of expiredEntries) {
        initialQueue.push({ ownerKey, endpoint })
      }
      if (expiredEntries.length > 0) {
        processInitialQueue()
      }
    } catch (error) {
      logger.error('Failed to initialize expiry cache', error, { module: 'ExpiryCacheStore' })
      set({ initialized: true })
    }
  },

  setExpiry: (ownerKey: string, endpoint: string, expiresAt: number, etag?: string | null) => {
    const key = makeKey(ownerKey, endpoint)
    const expiry: EndpointExpiry = { expiresAt, etag: etag ?? null }

    set((state) => {
      const endpoints = new Map(state.endpoints)
      endpoints.set(key, expiry)
      return { endpoints }
    })

    saveToDB(key, expiry).catch((error) => {
      logger.error('Failed to save expiry to DB', error, { module: 'ExpiryCacheStore', key })
    })

    scheduleTimer(key, ownerKey, endpoint, expiresAt)
  },

  getExpiry: (ownerKey: string, endpoint: string) => {
    const key = makeKey(ownerKey, endpoint)
    return get().endpoints.get(key)
  },

  isExpired: (ownerKey: string, endpoint: string) => {
    const key = makeKey(ownerKey, endpoint)
    const expiry = get().endpoints.get(key)
    if (!expiry) return true
    return Date.now() >= expiry.expiresAt
  },

  registerRefreshCallback: (endpointPattern: string, callback: RefreshCallback) => {
    callbacks.set(endpointPattern, callback)
    logger.debug('Registered refresh callback', { module: 'ExpiryCacheStore', pattern: endpointPattern })

    return () => {
      callbacks.delete(endpointPattern)
    }
  },

  triggerRefresh: (ownerKey: string, endpoint: string) => {
    const callback = findCallbackForEndpoint(endpoint)
    if (callback) {
      callback(ownerKey, endpoint).catch((err) => {
        logger.error('Manual refresh failed', err instanceof Error ? err : undefined, {
          module: 'ExpiryCacheStore',
          ownerKey,
          endpoint,
        })
      })
    }
  },

  queueInitialRefresh: (ownerKey: string, endpoint: string) => {
    initialQueue.push({ ownerKey, endpoint })
    processInitialQueue()
  },

  queueAllEndpointsForOwner: (ownerKey: string) => {
    for (const pattern of callbacks.keys()) {
      initialQueue.push({ ownerKey, endpoint: pattern })
    }
    logger.info('Queued all endpoints for owner', {
      module: 'ExpiryCacheStore',
      ownerKey,
      count: callbacks.size,
    })
    processInitialQueue()
  },

  queueMissingEndpoints: (ownerKeys: string[]) => {
    const { endpoints } = get()
    let queued = 0

    for (const ownerKey of ownerKeys) {
      for (const pattern of callbacks.keys()) {
        const key = makeKey(ownerKey, pattern)
        if (!endpoints.has(key)) {
          initialQueue.push({ ownerKey, endpoint: pattern })
          queued++
        }
      }
    }

    if (queued > 0) {
      logger.info('Queued missing endpoints', {
        module: 'ExpiryCacheStore',
        queued,
        owners: ownerKeys.length,
      })
      processInitialQueue()
    }
  },

  clearForOwner: (ownerKey: string) => {
    const prefix = `${ownerKey}:`

    for (const [key, timer] of timers) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer)
        timers.delete(key)
      }
    }

    set((state) => {
      const endpoints = new Map(state.endpoints)
      for (const key of endpoints.keys()) {
        if (key.startsWith(prefix)) {
          endpoints.delete(key)
        }
      }
      return { endpoints }
    })

    deleteByPrefixFromDB(prefix).catch((error) => {
      logger.error('Failed to clear expiry for owner', error, { module: 'ExpiryCacheStore', ownerKey })
    })

    logger.debug('Cleared expiry for owner', { module: 'ExpiryCacheStore', ownerKey })
  },

  clear: async () => {
    for (const timer of timers.values()) {
      clearTimeout(timer)
    }
    timers.clear()
    initialQueue.length = 0

    set({ endpoints: new Map() })

    try {
      await clearDB()
      logger.info('Expiry cache cleared', { module: 'ExpiryCacheStore' })
    } catch (error) {
      logger.error('Failed to clear expiry cache', error, { module: 'ExpiryCacheStore' })
    }
  },
}))
