import { create } from 'zustand'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/store/auth-store'

const DB_NAME = 'ecteveassets-expiry'
const DB_VERSION = 1
const STORE_EXPIRY = 'expiry'
const POLL_INTERVAL_MS = 60_000
const EMPTY_RESULT_CACHE_MS = 60 * 60 * 1000

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
  callbacks: Map<string, RefreshCallback>
  refreshQueue: Array<{ ownerKey: string; endpoint: string }>
  initialized: boolean
  isProcessingQueue: boolean
  pollingGeneration: number
  currentlyRefreshing: { ownerKey: string; endpoint: string } | null
  isPaused: boolean
}

interface ExpiryCacheActions {
  init: () => Promise<void>
  setExpiry: (
    ownerKey: string,
    endpoint: string,
    expiresAt: number,
    etag?: string | null,
    isEmpty?: boolean
  ) => void
  getExpiry: (ownerKey: string, endpoint: string) => EndpointExpiry | undefined
  isExpired: (ownerKey: string, endpoint: string) => boolean
  registerRefreshCallback: (
    endpointPattern: string,
    callback: RefreshCallback
  ) => () => void
  queueRefresh: (ownerKey: string, endpoint: string) => void
  queueAllEndpointsForOwner: (ownerKey: string) => void
  queueMissingEndpoints: (ownerKeys: string[]) => void
  clearForOwner: (ownerKey: string) => void
  clearByEndpoint: (pattern: string) => Promise<void>
  clear: () => Promise<void>
  pause: () => void
  resume: () => void
}

type ExpiryCacheStore = ExpiryCacheState & ExpiryCacheActions

let db: IDBDatabase | null = null
let sortedPatternsCache: string[] | null = null

function makeKey(ownerKey: string, endpoint: string): string {
  return `${ownerKey}:${endpoint}`
}

function parseKey(key: string): { ownerKey: string; endpoint: string } | null {
  const colonIdx = key.indexOf(':')
  if (colonIdx === -1) return null
  return { ownerKey: key.slice(0, colonIdx), endpoint: key.slice(colonIdx + 1) }
}

function isPatternApplicable(pattern: string, ownerKey: string): boolean {
  const isCharacter = ownerKey.startsWith('character-')
  if (pattern === '/structures' && isCharacter) return false
  if (pattern === '/clones/' && !isCharacter) return false
  return true
}

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open expiry cache DB', request.error, {
        module: 'ExpiryCacheStore',
      })
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
        endpoints.set(stored.key, {
          expiresAt: stored.expiresAt,
          etag: stored.etag,
        })
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
    store.put({
      key,
      expiresAt: expiry.expiresAt,
      etag: expiry.etag,
    } as StoredExpiry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteFromDBWhere(
  predicate: (key: string) => boolean
): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_EXPIRY], 'readwrite')
    const store = tx.objectStore(STORE_EXPIRY)
    const request = store.openCursor()

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        if (predicate(cursor.key as string)) {
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

function getSortedPatterns(callbacks: Map<string, RefreshCallback>): string[] {
  if (!sortedPatternsCache) {
    sortedPatternsCache = [...callbacks.keys()].sort(
      (a, b) => b.length - a.length
    )
  }
  return sortedPatternsCache
}

function findCallback(
  callbacks: Map<string, RefreshCallback>,
  endpoint: string
): RefreshCallback | undefined {
  for (const pattern of getSortedPatterns(callbacks)) {
    if (endpoint.includes(pattern)) return callbacks.get(pattern)
  }
  return undefined
}

function schedulePoll(generation: number) {
  setTimeout(() => {
    const state = useExpiryCacheStore.getState()
    if (generation !== state.pollingGeneration) return

    if (state.isPaused) {
      schedulePoll(generation)
      return
    }

    const now = Date.now()
    const toQueue: Array<{ ownerKey: string; endpoint: string }> = []

    for (const [key, expiry] of state.endpoints) {
      if (expiry.expiresAt <= now) {
        const parsed = parseKey(key)
        if (parsed) {
          const alreadyQueued = state.refreshQueue.some(
            (q) =>
              q.ownerKey === parsed.ownerKey && q.endpoint === parsed.endpoint
          )
          if (!alreadyQueued) {
            toQueue.push(parsed)
          }
        }
      }
    }

    if (toQueue.length > 0) {
      for (const item of toQueue) {
        useExpiryCacheStore
          .getState()
          .queueRefresh(item.ownerKey, item.endpoint)
      }
    }

    schedulePoll(generation)
  }, POLL_INTERVAL_MS)
}

function processQueue() {
  const state = useExpiryCacheStore.getState()
  if (
    state.isProcessingQueue ||
    state.refreshQueue.length === 0 ||
    state.isPaused
  )
    return

  useExpiryCacheStore.setState({ isProcessingQueue: true })

  const skippedOwners = new Set<string>()

  const processNext = async () => {
    const currentState = useExpiryCacheStore.getState()
    if (currentState.isPaused) {
      useExpiryCacheStore.setState({
        isProcessingQueue: false,
        currentlyRefreshing: null,
      })
      return
    }

    const { refreshQueue, callbacks } = currentState
    if (refreshQueue.length === 0) {
      useExpiryCacheStore.setState({
        isProcessingQueue: false,
        currentlyRefreshing: null,
      })
      return
    }

    const item = refreshQueue[0]
    useExpiryCacheStore.setState({ refreshQueue: refreshQueue.slice(1) })

    if (!item || skippedOwners.has(item.ownerKey)) {
      processNext()
      return
    }

    const owner = useAuthStore.getState().getOwner(item.ownerKey)
    if (owner?.authFailed) {
      skippedOwners.add(item.ownerKey)
      logger.info('Skipping refresh for auth-failed owner', {
        module: 'ExpiryCacheStore',
        ownerKey: item.ownerKey,
      })
      processNext()
      return
    }

    const callback = findCallback(callbacks, item.endpoint)
    if (callback) {
      useExpiryCacheStore.setState({ currentlyRefreshing: item })
      try {
        await callback(item.ownerKey, item.endpoint)
      } catch (err) {
        logger.error(
          'Refresh callback failed',
          err instanceof Error ? err : undefined,
          {
            module: 'ExpiryCacheStore',
            ownerKey: item.ownerKey,
            endpoint: item.endpoint,
          }
        )
      } finally {
        useExpiryCacheStore.setState({ currentlyRefreshing: null })
      }
    }

    processNext()
  }

  processNext()
}

export const useExpiryCacheStore = create<ExpiryCacheStore>((set, get) => ({
  endpoints: new Map(),
  callbacks: new Map(),
  refreshQueue: [],
  initialized: false,
  isProcessingQueue: false,
  pollingGeneration: 0,
  currentlyRefreshing: null,
  isPaused: false,

  init: async () => {
    const currentGen = get().pollingGeneration
    const newGen = currentGen + 1
    set({ pollingGeneration: newGen })

    try {
      const endpoints = await loadFromDB()
      set({ endpoints, initialized: true })

      const now = Date.now()
      const expired: Array<{ ownerKey: string; endpoint: string }> = []

      for (const [key, expiry] of endpoints) {
        if (expiry.expiresAt <= now) {
          const parsed = parseKey(key)
          if (parsed) expired.push(parsed)
        }
      }

      logger.info('Expiry cache initialized', {
        module: 'ExpiryCacheStore',
        total: endpoints.size,
        expired: expired.length,
      })

      for (const item of expired) {
        get().queueRefresh(item.ownerKey, item.endpoint)
      }

      schedulePoll(newGen)
    } catch (error) {
      logger.error('Failed to initialize expiry cache', error, {
        module: 'ExpiryCacheStore',
      })
      set({ initialized: true })
      schedulePoll(newGen)
    }
  },

  setExpiry: (ownerKey, endpoint, expiresAt, etag, isEmpty) => {
    const key = makeKey(ownerKey, endpoint)
    const now = Date.now()
    const cacheTime = expiresAt - now

    let effectiveExpiry = expiresAt
    if (isEmpty && cacheTime < EMPTY_RESULT_CACHE_MS) {
      effectiveExpiry = now + EMPTY_RESULT_CACHE_MS
      logger.debug('Extended cache for empty result', {
        module: 'ExpiryCacheStore',
        ownerKey,
        endpoint,
        originalCacheMinutes: Math.round(cacheTime / 60000),
        extendedCacheMinutes: 60,
      })
    }

    const expiry: EndpointExpiry = {
      expiresAt: effectiveExpiry,
      etag: etag ?? null,
    }

    set((state) => {
      const endpoints = new Map(state.endpoints)
      endpoints.set(key, expiry)
      return { endpoints }
    })

    saveToDB(key, expiry).catch((error) => {
      logger.error('Failed to save expiry to DB', error, {
        module: 'ExpiryCacheStore',
        key,
      })
    })
  },

  getExpiry: (ownerKey, endpoint) => {
    return get().endpoints.get(makeKey(ownerKey, endpoint))
  },

  isExpired: (ownerKey, endpoint) => {
    const expiry = get().endpoints.get(makeKey(ownerKey, endpoint))
    if (!expiry) return true
    return Date.now() >= expiry.expiresAt
  },

  registerRefreshCallback: (endpointPattern, callback) => {
    set((state) => {
      const callbacks = new Map(state.callbacks)
      callbacks.set(endpointPattern, callback)
      sortedPatternsCache = null
      return { callbacks }
    })
    logger.debug('Registered refresh callback', {
      module: 'ExpiryCacheStore',
      pattern: endpointPattern,
    })

    return () => {
      set((state) => {
        const callbacks = new Map(state.callbacks)
        callbacks.delete(endpointPattern)
        sortedPatternsCache = null
        return { callbacks }
      })
    }
  },

  queueRefresh: (ownerKey, endpoint) => {
    set((state) => {
      const alreadyQueued = state.refreshQueue.some(
        (q) => q.ownerKey === ownerKey && q.endpoint === endpoint
      )
      if (alreadyQueued) return state
      return { refreshQueue: [...state.refreshQueue, { ownerKey, endpoint }] }
    })
    processQueue()
  },

  queueAllEndpointsForOwner: (ownerKey) => {
    const { callbacks } = get()
    let count = 0
    for (const pattern of callbacks.keys()) {
      if (!isPatternApplicable(pattern, ownerKey)) continue
      get().queueRefresh(ownerKey, pattern)
      count++
    }
    logger.info('Queued all endpoints for owner', {
      module: 'ExpiryCacheStore',
      ownerKey,
      count,
    })
  },

  queueMissingEndpoints: (ownerKeys) => {
    const { endpoints, callbacks } = get()
    let queued = 0

    const endpointsByOwner = new Map<string, Set<string>>()
    for (const key of endpoints.keys()) {
      const colonIdx = key.indexOf(':')
      if (colonIdx === -1) continue
      const ownerKey = key.slice(0, colonIdx)
      if (!endpointsByOwner.has(ownerKey)) {
        endpointsByOwner.set(ownerKey, new Set())
      }
      endpointsByOwner.get(ownerKey)!.add(key)
    }

    for (const ownerKey of ownerKeys) {
      const ownerEndpoints = endpointsByOwner.get(ownerKey)
      for (const pattern of callbacks.keys()) {
        if (!isPatternApplicable(pattern, ownerKey)) continue
        let hasPattern = false
        if (ownerEndpoints) {
          for (const k of ownerEndpoints) {
            if (k.includes(pattern)) {
              hasPattern = true
              break
            }
          }
        }
        if (!hasPattern) {
          get().queueRefresh(ownerKey, pattern)
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
    }
  },

  clearForOwner: (ownerKey) => {
    const prefix = `${ownerKey}:`

    set((state) => {
      const endpoints = new Map(state.endpoints)
      for (const key of endpoints.keys()) {
        if (key.startsWith(prefix)) endpoints.delete(key)
      }
      const refreshQueue = state.refreshQueue.filter(
        (q) => q.ownerKey !== ownerKey
      )
      return { endpoints, refreshQueue }
    })

    deleteFromDBWhere((key) => key.startsWith(prefix)).catch((error) => {
      logger.error('Failed to clear expiry for owner', error, {
        module: 'ExpiryCacheStore',
        ownerKey,
      })
    })

    logger.debug('Cleared expiry for owner', {
      module: 'ExpiryCacheStore',
      ownerKey,
    })
  },

  clearByEndpoint: async (pattern) => {
    set((state) => {
      const endpoints = new Map(state.endpoints)
      const refreshQueue = state.refreshQueue.filter(
        (q) => !q.endpoint.includes(pattern)
      )
      for (const key of endpoints.keys()) {
        if (key.includes(pattern)) endpoints.delete(key)
      }
      return { endpoints, refreshQueue }
    })

    try {
      await deleteFromDBWhere((key) => key.includes(pattern))
      logger.debug('Cleared expiry by endpoint', {
        module: 'ExpiryCacheStore',
        pattern,
      })
    } catch (error) {
      logger.error('Failed to clear expiry by endpoint', error, {
        module: 'ExpiryCacheStore',
        pattern,
      })
    }
  },

  clear: async () => {
    set({
      endpoints: new Map(),
      refreshQueue: [],
      pollingGeneration: get().pollingGeneration + 1,
    })

    try {
      await clearDB()
      logger.info('Expiry cache cleared', { module: 'ExpiryCacheStore' })
    } catch (error) {
      logger.error('Failed to clear expiry cache', error, {
        module: 'ExpiryCacheStore',
      })
    }
  },

  pause: () => {
    set({ isPaused: true })
    logger.debug('Expiry cache polling paused', { module: 'ExpiryCacheStore' })
  },

  resume: () => {
    set({ isPaused: false })
    logger.debug('Expiry cache polling resumed', { module: 'ExpiryCacheStore' })
    processQueue()
  },
}))
