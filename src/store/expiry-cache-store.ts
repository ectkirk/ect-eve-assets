import { create } from 'zustand'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/store/auth-store'
import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbDeleteWhere,
  idbClear,
} from '@/lib/idb-utils'

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
  pruneOrphaned: () => Promise<number>
  clear: () => Promise<void>
  pause: () => void
  resume: () => void
}

type ExpiryCacheStore = ExpiryCacheState & ExpiryCacheActions

let sortedPatternsCache: string[] | null = null
let initPromise: Promise<void> | null = null

function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
}

function makeKey(ownerKey: string, endpoint: string): string {
  return `${ownerKey}:${normalizeEndpoint(endpoint)}`
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

async function getDB() {
  return openDatabase(DB.EXPIRY)
}

async function loadFromDB(): Promise<Map<string, EndpointExpiry>> {
  const db = await getDB()
  const records = await idbGetAll<StoredExpiry>(db, STORE_EXPIRY)
  const endpoints = new Map<string, EndpointExpiry>()
  for (const stored of records) {
    const parsed = parseKey(stored.key)
    if (!parsed) continue
    const normalizedKey = makeKey(parsed.ownerKey, parsed.endpoint)
    const existing = endpoints.get(normalizedKey)
    if (!existing || stored.expiresAt > existing.expiresAt) {
      endpoints.set(normalizedKey, {
        expiresAt: stored.expiresAt,
        etag: stored.etag,
      })
    }
  }
  return endpoints
}

async function saveToDB(key: string, expiry: EndpointExpiry): Promise<void> {
  const db = await getDB()
  await idbPut(db, STORE_EXPIRY, {
    key,
    expiresAt: expiry.expiresAt,
    etag: expiry.etag,
  } as StoredExpiry)
}

async function deleteFromDBWhere(
  predicate: (key: IDBValidKey) => boolean
): Promise<void> {
  const db = await getDB()
  await idbDeleteWhere(db, STORE_EXPIRY, predicate)
}

async function clearExpiryDB(): Promise<void> {
  const db = await getDB()
  await idbClear(db, STORE_EXPIRY)
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

function findMatchingPattern(
  callbacks: Map<string, RefreshCallback>,
  endpoint: string
): string | undefined {
  for (const pattern of getSortedPatterns(callbacks)) {
    if (endpoint.includes(pattern)) return pattern
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
    if (get().initialized) return
    if (initPromise) return initPromise

    initPromise = (async () => {
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
    })()

    return initPromise
  },

  setExpiry: (ownerKey, endpoint, expiresAt, etag, isEmpty) => {
    const key = makeKey(ownerKey, endpoint)
    const now = Date.now()
    const cacheTime = expiresAt - now

    let effectiveExpiry = expiresAt
    if (isEmpty && cacheTime < EMPTY_RESULT_CACHE_MS) {
      effectiveExpiry = now + EMPTY_RESULT_CACHE_MS
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
      const { callbacks } = state
      const incomingPattern = findMatchingPattern(callbacks, endpoint)

      const alreadyQueued = state.refreshQueue.some((q) => {
        if (q.ownerKey !== ownerKey) return false
        if (q.endpoint === endpoint) return true
        const queuedPattern = findMatchingPattern(callbacks, q.endpoint)
        return queuedPattern !== undefined && queuedPattern === incomingPattern
      })
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

    deleteFromDBWhere((key) => (key as string).startsWith(prefix)).catch(
      (error) => {
        logger.error('Failed to clear expiry for owner', error, {
          module: 'ExpiryCacheStore',
          ownerKey,
        })
      }
    )
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
      await deleteFromDBWhere((key) => (key as string).includes(pattern))
    } catch (error) {
      logger.error('Failed to clear expiry by endpoint', error, {
        module: 'ExpiryCacheStore',
        pattern,
      })
    }
  },

  pruneOrphaned: async () => {
    const validOwnerKeys = new Set(Object.keys(useAuthStore.getState().owners))
    const orphanedKeys: string[] = []

    const { endpoints } = get()
    for (const key of endpoints.keys()) {
      const parsed = parseKey(key)
      if (parsed && !validOwnerKeys.has(parsed.ownerKey)) {
        orphanedKeys.push(key)
      }
    }

    if (orphanedKeys.length === 0) return 0

    set((state) => {
      const newEndpoints = new Map(state.endpoints)
      const ownerKeysToRemove = new Set(
        orphanedKeys.map((k) => parseKey(k)!.ownerKey)
      )
      for (const key of orphanedKeys) {
        newEndpoints.delete(key)
      }
      const refreshQueue = state.refreshQueue.filter(
        (q) => !ownerKeysToRemove.has(q.ownerKey)
      )
      return { endpoints: newEndpoints, refreshQueue }
    })

    try {
      const ownerPrefixes = [
        ...new Set(orphanedKeys.map((k) => parseKey(k)!.ownerKey + ':')),
      ]
      await deleteFromDBWhere((key) =>
        ownerPrefixes.some((prefix) => (key as string).startsWith(prefix))
      )
      logger.info('Pruned orphaned expiry entries', {
        module: 'ExpiryCacheStore',
        count: orphanedKeys.length,
      })
    } catch (error) {
      logger.error('Failed to prune orphaned entries', error, {
        module: 'ExpiryCacheStore',
      })
    }

    return orphanedKeys.length
  },

  clear: async () => {
    initPromise = null
    set({
      endpoints: new Map(),
      refreshQueue: [],
      pollingGeneration: get().pollingGeneration + 1,
      initialized: false,
    })

    try {
      await clearExpiryDB()
      logger.info('Expiry cache cleared', { module: 'ExpiryCacheStore' })
    } catch (error) {
      logger.error('Failed to clear expiry cache', error, {
        module: 'ExpiryCacheStore',
      })
    }
  },

  pause: () => {
    set({ isPaused: true })
  },

  resume: () => {
    set({ isPaused: false })
    processQueue()
  },
}))
