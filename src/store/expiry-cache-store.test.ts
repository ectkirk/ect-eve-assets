import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

const mockGetOwner = vi.fn(() => null)

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      owners: {},
      getOwner: mockGetOwner,
    })),
  },
  ownerKey: (type: string, id: number) => `${type}-${id}`,
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { useExpiryCacheStore } from './expiry-cache-store'
import { useAuthStore } from './auth-store'
import { openDatabase, closeDatabase, idbPut, idbGetAll } from '@/lib/idb-utils'
import { DB } from '@/lib/db-constants'

async function resetStore() {
  // clear() resets the module-level initPromise
  await useExpiryCacheStore.getState().clear()
  useExpiryCacheStore.setState({
    endpoints: new Map(),
    callbacks: new Map(),
    refreshQueue: [],
    initialized: false,
    isProcessingQueue: false,
    pollingGeneration: 0,
    currentlyRefreshing: null,
    isPaused: false,
  })
}

async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('expiry-cache-store', () => {
  beforeEach(async () => {
    await resetStore()
    // Clear the DB between tests
    try {
      const db = await openDatabase(DB.EXPIRY)
      const tx = db.transaction(['expiry'], 'readwrite')
      tx.objectStore('expiry').clear()
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      // DB might not exist yet
    }
    mockGetOwner.mockReturnValue(null)
    vi.mocked(useAuthStore.getState).mockReturnValue({
      owners: {},
      getOwner: mockGetOwner,
    } as never)
  })

  describe('init', () => {
    it('loads endpoints from IndexedDB', async () => {
      const db = await openDatabase(DB.EXPIRY)
      await idbPut(db, 'expiry', {
        key: 'character-123:/assets',
        expiresAt: Date.now() + 60_000,
        etag: 'abc',
      })

      await useExpiryCacheStore.getState().init()

      const state = useExpiryCacheStore.getState()
      expect(state.initialized).toBe(true)
      expect(state.endpoints.size).toBe(1)
      const expiry = state.endpoints.get('character-123:/assets')
      expect(expiry).toBeDefined()
      expect(expiry!.etag).toBe('abc')
    })

    it('queues expired endpoints for refresh', async () => {
      const db = await openDatabase(DB.EXPIRY)
      await idbPut(db, 'expiry', {
        key: 'character-123:/assets',
        expiresAt: Date.now() - 1000,
        etag: null,
      })

      await useExpiryCacheStore.getState().init()

      const state = useExpiryCacheStore.getState()
      expect(state.refreshQueue.length).toBe(1)
      expect(state.refreshQueue[0]).toEqual({
        ownerKey: 'character-123',
        endpoint: '/assets',
      })
    })

    it('is idempotent', async () => {
      await useExpiryCacheStore.getState().init()
      const gen1 = useExpiryCacheStore.getState().pollingGeneration

      await useExpiryCacheStore.getState().init()
      const gen2 = useExpiryCacheStore.getState().pollingGeneration

      expect(gen1).toBe(gen2)
    })

    it('sets initialized=true even on DB failure', async () => {
      // Close the DB so the next openDatabase creates a fresh promise
      await closeDatabase(DB.EXPIRY.name)

      // Mock idbGetAll (used by loadFromDB) to simulate a DB read failure.
      // We dynamically import so the spy applies to the module reference used by the store.
      const idbUtils = await import('@/lib/idb-utils')
      const spy = vi
        .spyOn(idbUtils, 'openDatabase')
        .mockRejectedValue(new Error('DB failure'))

      await useExpiryCacheStore.getState().init()

      expect(useExpiryCacheStore.getState().initialized).toBe(true)

      spy.mockRestore()
    })
  })

  describe('setExpiry', () => {
    it('stores expiry in memory and persists to DB', async () => {
      await useExpiryCacheStore.getState().init()

      const future = Date.now() + 300_000
      useExpiryCacheStore
        .getState()
        .setExpiry('character-1', '/assets', future, 'etag-1')

      const expiry = useExpiryCacheStore
        .getState()
        .endpoints.get('character-1:/assets')
      expect(expiry).toBeDefined()
      expect(expiry!.expiresAt).toBe(future)
      expect(expiry!.etag).toBe('etag-1')

      // Wait for async persist
      await flushMicrotasks()

      const db = await openDatabase(DB.EXPIRY)
      const records = await idbGetAll<{
        key: string
        expiresAt: number
        etag: string | null
      }>(db, 'expiry')
      const found = records.find((r) => r.key === 'character-1:/assets')
      expect(found).toBeDefined()
      expect(found!.expiresAt).toBe(future)
    })

    it('extends empty results to EMPTY_RESULT_CACHE_MS (1 hour)', async () => {
      await useExpiryCacheStore.getState().init()

      const shortExpiry = Date.now() + 5_000
      useExpiryCacheStore
        .getState()
        .setExpiry('character-1', '/contracts', shortExpiry, null, true)

      const expiry = useExpiryCacheStore
        .getState()
        .endpoints.get('character-1:/contracts')
      expect(expiry).toBeDefined()
      // Should be extended to ~1 hour from now, not the 5s expiry
      const oneHourMs = 60 * 60 * 1000
      expect(expiry!.expiresAt).toBeGreaterThan(Date.now() + oneHourMs - 5_000)
      expect(expiry!.expiresAt).toBeLessThanOrEqual(
        Date.now() + oneHourMs + 1_000
      )
    })
  })

  describe('isExpired', () => {
    it('returns true for unknown endpoints', () => {
      expect(
        useExpiryCacheStore.getState().isExpired('owner-1', '/unknown')
      ).toBe(true)
    })

    it('returns true for past timestamps', () => {
      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['owner-1:/assets', { expiresAt: Date.now() - 1000, etag: null }],
        ]),
      })
      expect(
        useExpiryCacheStore.getState().isExpired('owner-1', '/assets')
      ).toBe(true)
    })

    it('returns false for future timestamps', () => {
      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['owner-1:/assets', { expiresAt: Date.now() + 60_000, etag: null }],
        ]),
      })
      expect(
        useExpiryCacheStore.getState().isExpired('owner-1', '/assets')
      ).toBe(false)
    })
  })

  describe('registerRefreshCallback', () => {
    it('stores callback and triggers queue processing', async () => {
      const cb = vi.fn().mockResolvedValue(undefined)

      // Queue an item first
      useExpiryCacheStore.setState({
        refreshQueue: [{ ownerKey: 'char-1', endpoint: '/assets' }],
      })

      useExpiryCacheStore.getState().registerRefreshCallback('/assets', cb)

      await vi.waitFor(() => {
        expect(cb).toHaveBeenCalledWith('char-1', '/assets')
      })
    })

    it('returns unsubscribe function that removes callback', () => {
      const cb = vi.fn()
      const unsub = useExpiryCacheStore
        .getState()
        .registerRefreshCallback('/assets', cb)

      expect(useExpiryCacheStore.getState().callbacks.has('/assets')).toBe(true)

      unsub()

      expect(useExpiryCacheStore.getState().callbacks.has('/assets')).toBe(
        false
      )
    })
  })

  describe('queueRefresh', () => {
    it('adds item to queue and starts processing', () => {
      useExpiryCacheStore.getState().queueRefresh('char-1', '/assets')

      const state = useExpiryCacheStore.getState()
      expect(
        state.refreshQueue.some(
          (q) => q.ownerKey === 'char-1' && q.endpoint === '/assets'
        )
      ).toBe(true)
    })

    it('deduplicates items by pattern match', () => {
      const cb = vi.fn()
      useExpiryCacheStore.getState().registerRefreshCallback('/assets', cb)

      useExpiryCacheStore.getState().queueRefresh('char-1', '/assets')
      useExpiryCacheStore.getState().queueRefresh('char-1', '/assets')

      const state = useExpiryCacheStore.getState()
      const matching = state.refreshQueue.filter(
        (q) => q.ownerKey === 'char-1' && q.endpoint === '/assets'
      )
      expect(matching.length).toBeLessThanOrEqual(1)
    })
  })

  describe('processQueue', () => {
    it('executes callback for queued items', async () => {
      const cb = vi.fn().mockResolvedValue(undefined)

      useExpiryCacheStore.setState({
        refreshQueue: [{ ownerKey: 'char-1', endpoint: '/assets' }],
      })

      useExpiryCacheStore.getState().registerRefreshCallback('/assets', cb)

      await vi.waitFor(() => {
        expect(cb).toHaveBeenCalledWith('char-1', '/assets')
      })
    })

    it('defers items with no matching callback and continues processing others', async () => {
      const knownCb = vi.fn().mockResolvedValue(undefined)

      useExpiryCacheStore.setState({
        refreshQueue: [
          { ownerKey: 'char-1', endpoint: '/unknown-endpoint' },
          { ownerKey: 'char-1', endpoint: '/known' },
        ],
      })

      useExpiryCacheStore.getState().registerRefreshCallback('/known', knownCb)

      await vi.waitFor(() => {
        expect(knownCb).toHaveBeenCalledWith('char-1', '/known')
      })

      // The unknown item should still be in the queue (deferred)
      const state = useExpiryCacheStore.getState()
      expect(
        state.refreshQueue.some((q) => q.endpoint === '/unknown-endpoint')
      ).toBe(true)
    })

    it('stops after all remaining items lack callbacks (deferred count)', async () => {
      useExpiryCacheStore.setState({
        refreshQueue: [
          { ownerKey: 'char-1', endpoint: '/no-cb-1' },
          { ownerKey: 'char-1', endpoint: '/no-cb-2' },
        ],
      })

      // Trigger processing by registering an unrelated callback
      useExpiryCacheStore
        .getState()
        .registerRefreshCallback('/unrelated', vi.fn())

      await flushMicrotasks()
      await flushMicrotasks()

      const state = useExpiryCacheStore.getState()
      // Processing should have stopped
      expect(state.isProcessingQueue).toBe(false)
      // Items should still be in queue
      expect(state.refreshQueue.length).toBe(2)
    })

    it('retries deferred items when new callback registers', async () => {
      useExpiryCacheStore.setState({
        refreshQueue: [{ ownerKey: 'char-1', endpoint: '/late' }],
      })

      // Trigger processing — /late has no callback, so it gets deferred
      useExpiryCacheStore
        .getState()
        .registerRefreshCallback('/unrelated', vi.fn())

      await flushMicrotasks()
      await flushMicrotasks()

      // Now register a callback for /late
      const lateCb = vi.fn().mockResolvedValue(undefined)
      useExpiryCacheStore.getState().registerRefreshCallback('/late', lateCb)

      await vi.waitFor(() => {
        expect(lateCb).toHaveBeenCalledWith('char-1', '/late')
      })
    })

    it('skips auth-failed owners', async () => {
      const cb = vi.fn().mockResolvedValue(undefined)

      mockGetOwner.mockReturnValue({ authFailed: true } as never)
      vi.mocked(useAuthStore.getState).mockReturnValue({
        owners: {},
        getOwner: mockGetOwner,
      } as never)

      useExpiryCacheStore.setState({
        refreshQueue: [{ ownerKey: 'char-1', endpoint: '/assets' }],
      })

      useExpiryCacheStore.getState().registerRefreshCallback('/assets', cb)

      await flushMicrotasks()
      await flushMicrotasks()

      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('clearForOwner', () => {
    it('removes endpoints and queued items for owner', async () => {
      await useExpiryCacheStore.getState().init()

      useExpiryCacheStore.setState({
        endpoints: new Map([
          [
            'character-1:/assets',
            { expiresAt: Date.now() + 60_000, etag: null },
          ],
          [
            'character-2:/assets',
            { expiresAt: Date.now() + 60_000, etag: null },
          ],
        ]),
        refreshQueue: [
          { ownerKey: 'character-1', endpoint: '/assets' },
          { ownerKey: 'character-2', endpoint: '/assets' },
        ],
      })

      useExpiryCacheStore.getState().clearForOwner('character-1')

      const state = useExpiryCacheStore.getState()
      expect(state.endpoints.has('character-1:/assets')).toBe(false)
      expect(state.endpoints.has('character-2:/assets')).toBe(true)
      expect(state.refreshQueue.length).toBe(1)
      expect(state.refreshQueue[0].ownerKey).toBe('character-2')
    })
  })

  describe('pause/resume', () => {
    it('pause stops queue processing', async () => {
      const cb = vi.fn().mockResolvedValue(undefined)
      useExpiryCacheStore.getState().registerRefreshCallback('/assets', cb)

      useExpiryCacheStore.getState().pause()

      useExpiryCacheStore.getState().queueRefresh('char-1', '/assets')

      await flushMicrotasks()
      await flushMicrotasks()

      expect(cb).not.toHaveBeenCalled()
    })

    it('resume restarts processing', async () => {
      const cb = vi.fn().mockResolvedValue(undefined)
      useExpiryCacheStore.getState().registerRefreshCallback('/assets', cb)

      useExpiryCacheStore.getState().pause()
      useExpiryCacheStore.getState().queueRefresh('char-1', '/assets')

      await flushMicrotasks()
      expect(cb).not.toHaveBeenCalled()

      useExpiryCacheStore.getState().resume()

      await vi.waitFor(() => {
        expect(cb).toHaveBeenCalledWith('char-1', '/assets')
      })
    })
  })
})
