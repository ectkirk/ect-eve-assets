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

interface ExpiryCacheState {
  endpoints: Map<string, EndpointExpiry>
  initialized: boolean
}

interface ExpiryCacheActions {
  init: () => Promise<void>
  setExpiry: (ownerKey: string, endpoint: string, expiresAt: number, etag?: string | null) => void
  getExpiry: (ownerKey: string, endpoint: string) => EndpointExpiry | undefined
  isExpired: (ownerKey: string, endpoint: string) => boolean
  getNextExpiry: () => { key: string; expiresAt: number } | null
  clearForOwner: (ownerKey: string) => void
  clear: () => Promise<void>
}

type ExpiryCacheStore = ExpiryCacheState & ExpiryCacheActions

let db: IDBDatabase | null = null

function makeKey(ownerKey: string, endpoint: string): string {
  return `${ownerKey}:${endpoint}`
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

export const useExpiryCacheStore = create<ExpiryCacheStore>((set, get) => ({
  endpoints: new Map(),
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const endpoints = await loadFromDB()
      set({ endpoints, initialized: true })
      logger.info('Expiry cache initialized', { module: 'ExpiryCacheStore', count: endpoints.size })
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

    logger.debug('Expiry set', {
      module: 'ExpiryCacheStore',
      ownerKey,
      endpoint,
      expiresAt,
      expiresIn: Math.round((expiresAt - Date.now()) / 1000),
    })
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

  getNextExpiry: () => {
    const { endpoints } = get()
    const now = Date.now()
    let next: { key: string; expiresAt: number } | null = null

    for (const [key, expiry] of endpoints) {
      if (expiry.expiresAt <= now) continue
      if (!next || expiry.expiresAt < next.expiresAt) {
        next = { key, expiresAt: expiry.expiresAt }
      }
    }

    return next
  },

  clearForOwner: (ownerKey: string) => {
    const prefix = `${ownerKey}:`

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
    set({ endpoints: new Map() })

    try {
      await clearDB()
      logger.info('Expiry cache cleared', { module: 'ExpiryCacheStore' })
    } catch (error) {
      logger.error('Failed to clear expiry cache', error, { module: 'ExpiryCacheStore' })
    }
  },
}))
