import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import type { Owner } from './auth-store'
import { createMockOwner, createESIResponse } from '@/test/helpers'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDB = {
  loadAll: vi.fn<() => Promise<{ owner: Owner; data: number[] }[]>>(),
  save: vi.fn<
    (ownerKey: string, owner: Owner, data: number[]) => Promise<void>
  >(),
  delete: vi.fn<(ownerKey: string) => Promise<void>>(),
  clear: vi.fn<() => Promise<void>>(),
  loadMeta: vi.fn(),
  saveMeta: vi.fn(),
  getFromExtra: vi.fn(),
  putToExtra: vi.fn(),
  clearExtra: vi.fn(),
}

vi.mock('@/lib/owner-indexed-db', () => ({
  createOwnerDB: vi.fn(() => mockDB),
}))

const mockSetOwnerScopesOutdated = vi.fn()

vi.mock('./auth-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth-store')>()
  return {
    ...actual,
    useAuthStore: {
      getState: vi.fn(() => ({
        owners: {},
        setOwnerScopesOutdated: mockSetOwnerScopesOutdated,
      })),
    },
  }
})

const mockExpiryCacheState = {
  isExpired: vi.fn(() => true),
  setExpiry: vi.fn(),
  clearForOwner: vi.fn(),
  registerRefreshCallback: vi.fn(() => vi.fn()),
}

vi.mock('./expiry-cache-store', () => ({
  useExpiryCacheStore: {
    getState: vi.fn(() => mockExpiryCacheState),
  },
}))

vi.mock('@/lib/data-resolver', () => ({
  triggerResolution: vi.fn(),
}))

const mockRegister = vi.fn()
vi.mock('./store-registry', () => ({
  useStoreRegistry: {
    getState: vi.fn(() => ({
      register: mockRegister,
    })),
  },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

import { createOwnerStore, type OwnerStoreConfig } from './create-owner-store'
import { useAuthStore } from './auth-store'

interface TestOwnerData {
  owner: Owner
  items: number[]
}

const mockFetchData =
  vi.fn<
    (
      owner: Owner
    ) => Promise<{ data: number[]; expiresAt: number; etag?: string | null }>
  >()

function makeConfig(
  overrides?: Partial<OwnerStoreConfig<number[], TestOwnerData>>
): OwnerStoreConfig<number[], TestOwnerData> {
  return {
    name: 'TestItems',
    moduleName: 'test-items',
    endpointPattern: '/test/{owner_id}/items/',
    dbConfig: {
      dbName: 'test-items-db',
      storeName: 'items',
      dataKey: 'items',
    },
    getEndpoint: (owner) => `/test/${owner.id}/items/`,
    fetchData: mockFetchData,
    toOwnerData: (owner, data) => ({ owner, items: data }),
    ...overrides,
  }
}

function mockOwners(owners: Record<string, Owner>) {
  vi.mocked(useAuthStore.getState).mockReturnValue({
    owners,
    setOwnerScopesOutdated: mockSetOwnerScopesOutdated,
  } as never)
}

const ownerA = createMockOwner({
  id: 1001,
  name: 'Alpha',
  type: 'character',
})
const ownerB = createMockOwner({
  id: 1002,
  name: 'Beta',
  type: 'character',
})
const corpOwner = createMockOwner({
  id: 98000001,
  characterId: 1001,
  name: 'TestCorp',
  type: 'corporation',
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createOwnerStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchData.mockReset()
    mockDB.loadAll.mockResolvedValue([])
    mockDB.save.mockResolvedValue(undefined)
    mockDB.delete.mockResolvedValue(undefined)
    mockDB.clear.mockResolvedValue(undefined)
    mockExpiryCacheState.isExpired.mockReturnValue(true)
  })

  // ── init ─────────────────────────────────────────────────────────────────

  describe('init', () => {
    it('loads data from IndexedDB', async () => {
      mockDB.loadAll.mockResolvedValue([{ owner: ownerA, data: [10, 20] }])
      const store = createOwnerStore(makeConfig())

      await store.getState().init()

      expect(mockDB.loadAll).toHaveBeenCalledTimes(1)
      expect(store.getState().initialized).toBe(true)
      expect(store.getState().dataByOwner).toHaveLength(1)
      expect(store.getState().dataByOwner[0]!.items).toEqual([10, 20])
    })

    it('is idempotent — second call does not reload from DB', async () => {
      mockDB.loadAll.mockResolvedValue([])
      const store = createOwnerStore(makeConfig())

      const p1 = store.getState().init()
      const p2 = store.getState().init()
      await Promise.all([p1, p2])
      expect(mockDB.loadAll).toHaveBeenCalledTimes(1)

      // A third call after init is complete also skips
      await store.getState().init()
      expect(mockDB.loadAll).toHaveBeenCalledTimes(1)
    })

    it('resets initPromise on failure allowing retry after clear', async () => {
      mockDB.loadAll.mockRejectedValueOnce(new Error('DB error'))
      const store = createOwnerStore(makeConfig())

      await store.getState().init()
      // After failure, initialized is set to true but data is empty
      expect(store.getState().initialized).toBe(true)

      // clear resets initialized, and initPromise is null after failure
      await store.getState().clear()
      expect(store.getState().initialized).toBe(false)

      mockDB.loadAll.mockResolvedValue([{ owner: ownerA, data: [42] }])
      await store.getState().init()
      expect(store.getState().dataByOwner).toHaveLength(1)
      expect(store.getState().dataByOwner[0]!.items).toEqual([42])
    })

    it('calls rebuildExtraState with loaded data', async () => {
      const rebuildExtraState = vi.fn(() => ({ total: 99 }))
      mockDB.loadAll.mockResolvedValue([{ owner: ownerA, data: [1, 2, 3] }])
      const store = createOwnerStore(
        makeConfig({
          extraState: { total: 0 },
          rebuildExtraState,
        })
      )

      await store.getState().init()

      expect(rebuildExtraState).toHaveBeenCalledWith([
        { owner: ownerA, items: [1, 2, 3] },
      ])
      expect((store.getState() as unknown as { total: number }).total).toBe(99)
    })
  })

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls init first if not initialized', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockResolvedValue(createESIResponse([1]))
      mockOwners({ 'character-1001': ownerA })

      const store = createOwnerStore(makeConfig())
      expect(store.getState().initialized).toBe(false)

      await store.getState().update()

      expect(mockDB.loadAll).toHaveBeenCalled()
      expect(store.getState().initialized).toBe(true)
    })

    it('skips when already updating', async () => {
      mockDB.loadAll.mockResolvedValue([])
      let resolveFirst!: () => void
      mockFetchData.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () => resolve(createESIResponse([1]))
          })
      )
      mockOwners({ 'character-1001': ownerA })

      const store = createOwnerStore(makeConfig())
      await store.getState().init()

      const p1 = store.getState().update(true)
      // Second call should be skipped because isUpdating is true
      const p2 = store.getState().update(true)

      resolveFirst()
      await p1
      await p2

      expect(mockFetchData).toHaveBeenCalledTimes(1)
    })

    it('sets error when no owners logged in', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockOwners({})

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      await store.getState().update()

      expect(store.getState().updateError).toBe('No owners logged in')
    })

    it('skips non-expired owners', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockExpiryCacheState.isExpired.mockReturnValue(false)
      mockOwners({ 'character-1001': ownerA })

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      await store.getState().update()

      expect(mockFetchData).not.toHaveBeenCalled()
    })

    it('force=true bypasses expiry check', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockExpiryCacheState.isExpired.mockReturnValue(false)
      mockFetchData.mockResolvedValue(createESIResponse([1, 2]))
      mockOwners({ 'character-1001': ownerA })

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      await store.getState().update(true)

      expect(mockFetchData).toHaveBeenCalledWith(ownerA)
    })

    it('fetches data and saves to DB', async () => {
      mockDB.loadAll.mockResolvedValue([])
      const response = createESIResponse([10, 20, 30])
      mockFetchData.mockResolvedValue(response)
      mockOwners({ 'character-1001': ownerA })

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      await store.getState().update(true)

      expect(mockFetchData).toHaveBeenCalledWith(ownerA)
      expect(mockDB.save).toHaveBeenCalledWith(
        'character-1001',
        ownerA,
        [10, 20, 30]
      )
      expect(store.getState().dataByOwner).toHaveLength(1)
      expect(store.getState().dataByOwner[0]!.items).toEqual([10, 20, 30])
      expect(store.getState().isUpdating).toBe(false)
    })

    it('merges updated owners with existing state', async () => {
      mockDB.loadAll.mockResolvedValue([{ owner: ownerA, data: [1] }])

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      expect(store.getState().dataByOwner).toHaveLength(1)

      // Now update only ownerB
      mockFetchData.mockResolvedValue(createESIResponse([99]))
      mockOwners({
        'character-1001': ownerA,
        'character-1002': ownerB,
      })
      // Only ownerB is expired
      mockExpiryCacheState.isExpired.mockImplementation(
        (...args: unknown[]) => (args[0] as string) === 'character-1002'
      )

      await store.getState().update()

      expect(mockFetchData).toHaveBeenCalledTimes(1)

      const data = store.getState().dataByOwner
      expect(data).toHaveLength(2)
      const aData = data.find((d) => d.owner.id === 1001)
      const bData = data.find((d) => d.owner.id === 1002)
      expect(aData?.items).toEqual([1])
      expect(bData?.items).toEqual([99])
    })

    it('handles per-owner fetch errors without losing other owners', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockOwners({
        'character-1001': ownerA,
        'character-1002': ownerB,
      })

      let callCount = 0
      mockFetchData.mockImplementation(async (owner: Owner) => {
        callCount++
        if (owner.id === 1001) {
          throw new Error('Network error')
        }
        return createESIResponse([42])
      })

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      await store.getState().update(true)

      expect(callCount).toBe(2)
      const data = store.getState().dataByOwner
      // ownerB data should still be present
      expect(data).toHaveLength(1)
      expect(data[0]!.owner.id).toBe(1002)
      expect(data[0]!.items).toEqual([42])
    })

    it('sets scopesOutdated for scope errors', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockRejectedValue(
        new Error('Token is not valid for any required scope')
      )
      mockOwners({ 'character-1001': ownerA })

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      await store.getState().update(true)

      expect(mockSetOwnerScopesOutdated).toHaveBeenCalledWith(
        'character-1001',
        true
      )
    })

    it('passes isDataEmpty=true to setExpiry when isEmpty returns true', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockResolvedValue(createESIResponse([]))
      mockOwners({ 'character-1001': ownerA })

      const store = createOwnerStore(
        makeConfig({
          isEmpty: (data) => data.length === 0,
        })
      )
      await store.getState().init()
      await store.getState().update(true)

      expect(mockExpiryCacheState.setExpiry).toHaveBeenCalledWith(
        'character-1001',
        '/test/1001/items/',
        expect.any(Number),
        null,
        true
      )
    })

    it('skips fetchData and sets scopesOutdated when owner lacks requiredScope', async () => {
      mockDB.loadAll.mockResolvedValue([])
      const ownerNoScope = createMockOwner({
        id: 1001,
        name: 'Alpha',
        type: 'character',
        scopes: ['some-other-scope.v1'],
      })
      mockOwners({ 'character-1001': ownerNoScope })

      const store = createOwnerStore(
        makeConfig({ requiredScope: 'esi-test.scope.v1' })
      )
      await store.getState().init()
      await store.getState().update(true)

      expect(mockFetchData).not.toHaveBeenCalled()
      expect(mockSetOwnerScopesOutdated).toHaveBeenCalledWith(
        'character-1001',
        true
      )
    })

    it('ownerFilter restricts which owners are fetched', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockResolvedValue(createESIResponse([1]))
      mockOwners({
        'character-1001': ownerA,
        'corporation-98000001': corpOwner,
      })

      const store = createOwnerStore(makeConfig({ ownerFilter: 'character' }))
      await store.getState().init()
      await store.getState().update(true)

      expect(mockFetchData).toHaveBeenCalledTimes(1)
      expect(mockFetchData).toHaveBeenCalledWith(ownerA)
    })

    it('skips owners with authFailed=true', async () => {
      mockDB.loadAll.mockResolvedValue([])
      const failedOwner = createMockOwner({
        id: 1001,
        name: 'Alpha',
        type: 'character',
        authFailed: true,
      })
      mockOwners({ 'character-1001': failedOwner })

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      await store.getState().update(true)

      expect(mockFetchData).not.toHaveBeenCalled()
    })

    it('calls rebuildExtraState after update completes', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockResolvedValue(createESIResponse([10, 20]))
      mockOwners({ 'character-1001': ownerA })

      const rebuildExtraState = vi.fn(() => ({ count: 2 }))
      const store = createOwnerStore(
        makeConfig({
          extraState: { count: 0 },
          rebuildExtraState,
        })
      )
      await store.getState().init()
      // Clear the call from init
      rebuildExtraState.mockClear()

      await store.getState().update(true)

      expect(rebuildExtraState).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ items: [10, 20] })])
      )
      expect((store.getState() as unknown as { count: number }).count).toBe(2)
    })

    it('calls rebuildExtraState in removeForOwner with remaining data', async () => {
      mockDB.loadAll.mockResolvedValue([
        { owner: ownerA, data: [1] },
        { owner: ownerB, data: [2] },
      ])

      const rebuildExtraState = vi.fn(() => ({ count: 1 }))
      const store = createOwnerStore(
        makeConfig({
          extraState: { count: 0 },
          rebuildExtraState,
        })
      )
      await store.getState().init()
      rebuildExtraState.mockClear()

      await store.getState().removeForOwner('character', 1001)

      expect(rebuildExtraState).toHaveBeenCalledTimes(1)
      expect(rebuildExtraState).toHaveBeenCalledWith([
        expect.objectContaining({ owner: ownerB, items: [2] }),
      ])
    })

    it('sets updateError when all owners fail', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockRejectedValue(new Error('Network error'))
      mockOwners({ 'character-1001': ownerA })

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      await store.getState().update(true)

      expect(store.getState().updateError).toBe('Failed to fetch any TestItems')
    })
  })

  // ── update concurrency ───────────────────────────────────────────────────

  describe('update concurrency', () => {
    it('shared updatingOwners guard — skip owner already being updated by updateForOwner', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockOwners({ 'character-1001': ownerA })

      let resolveSingle!: (v: {
        data: number[]
        expiresAt: number
        etag: null
      }) => void
      const singlePromise = new Promise<{
        data: number[]
        expiresAt: number
        etag: null
      }>((r) => {
        resolveSingle = r
      })

      // First call via updateForOwner — will hold the lock
      mockFetchData.mockReturnValueOnce(singlePromise)
      const store = createOwnerStore(makeConfig())
      await store.getState().init()

      const p1 = store.getState().updateForOwner(ownerA)

      // Now batch update tries the same owner — should skip it
      mockFetchData.mockResolvedValueOnce(createESIResponse([77]))
      const p2 = store.getState().update(true)

      resolveSingle({ data: [55], expiresAt: Date.now() + 300_000, etag: null })
      await p1
      await p2

      // fetchData should have been called only once (from updateForOwner)
      expect(mockFetchData).toHaveBeenCalledTimes(1)
      expect(store.getState().dataByOwner[0]!.items).toEqual([55])
    })

    it('generation counter — clear() during update causes subsequent owners to be skipped', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockOwners({
        'character-1001': ownerA,
        'character-1002': ownerB,
      })

      let fetchCount = 0
      let resolveFirstFetch!: (v: {
        data: number[]
        expiresAt: number
        etag: null
      }) => void

      mockFetchData.mockImplementation(
        () =>
          new Promise((resolve) => {
            fetchCount++
            if (fetchCount === 1) {
              resolveFirstFetch = resolve
            } else {
              resolve({
                data: [99],
                expiresAt: Date.now() + 300_000,
                etag: null,
              })
            }
          })
      )

      const store = createOwnerStore(makeConfig())
      await store.getState().init()

      const updatePromise = store.getState().update(true)

      // Yield to let the update proceed to the first fetchData call
      await vi.waitFor(() => expect(fetchCount).toBe(1))

      // clear() during the first fetch increments generation
      await store.getState().clear()

      // Resolve the first fetch — after clear, the loop should check gen and bail
      resolveFirstFetch({
        data: [1],
        expiresAt: Date.now() + 300_000,
        etag: null,
      })
      await updatePromise

      // The second owner should never have been fetched because generation changed
      expect(fetchCount).toBe(1)
      // Verify isUpdating was properly reset after generation mismatch
      expect(store.getState().isUpdating).toBe(false)
    })
  })

  // ── updateForOwner ───────────────────────────────────────────────────────

  describe('updateForOwner', () => {
    it('calls init first if not initialized', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockResolvedValue(createESIResponse([1]))

      const store = createOwnerStore(makeConfig())
      expect(store.getState().initialized).toBe(false)

      await store.getState().updateForOwner(ownerA)

      expect(mockDB.loadAll).toHaveBeenCalled()
      expect(store.getState().initialized).toBe(true)
    })

    it('skips if already updating same owner (updatingOwners guard)', async () => {
      mockDB.loadAll.mockResolvedValue([])

      let resolveFirst!: (v: {
        data: number[]
        expiresAt: number
        etag: null
      }) => void
      mockFetchData.mockReturnValueOnce(
        new Promise((r) => {
          resolveFirst = r
        })
      )

      const store = createOwnerStore(makeConfig())
      await store.getState().init()

      const p1 = store.getState().updateForOwner(ownerA)
      // Second call for same owner should bail
      mockFetchData.mockResolvedValueOnce(createESIResponse([99]))
      const p2 = store.getState().updateForOwner(ownerA)

      resolveFirst({ data: [1], expiresAt: Date.now() + 300_000, etag: null })
      await p1
      await p2

      expect(mockFetchData).toHaveBeenCalledTimes(1)
    })

    it('respects ownerFilter — skips corporation owner when filter is character', async () => {
      mockDB.loadAll.mockResolvedValue([])

      const store = createOwnerStore(makeConfig({ ownerFilter: 'character' }))
      await store.getState().init()

      await store.getState().updateForOwner(corpOwner)

      expect(mockFetchData).not.toHaveBeenCalled()
    })

    it('calls onBeforeOwnerUpdate and onAfterOwnerUpdate hooks in order', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockResolvedValue(createESIResponse([5, 6]))

      const callOrder: string[] = []
      const onBeforeOwnerUpdate = vi.fn(() => {
        callOrder.push('before')
        return { previousData: [1, 2] }
      })
      const onAfterOwnerUpdate = vi.fn(
        (params: {
          owner: Owner
          newData: number[]
          previousData?: number[]
        }) => {
          callOrder.push('after')
          expect(params.previousData).toEqual([1, 2])
          expect(params.newData).toEqual([5, 6])
        }
      )

      const store = createOwnerStore(
        makeConfig({ onBeforeOwnerUpdate, onAfterOwnerUpdate })
      )
      await store.getState().init()
      await store.getState().updateForOwner(ownerA)

      expect(callOrder).toEqual(['before', 'after'])
      expect(onBeforeOwnerUpdate).toHaveBeenCalledTimes(1)
      expect(onAfterOwnerUpdate).toHaveBeenCalledTimes(1)
    })

    it('skips fetchData and sets scopesOutdated when owner lacks requiredScope', async () => {
      mockDB.loadAll.mockResolvedValue([])
      const ownerNoScope = createMockOwner({
        id: 1001,
        name: 'Alpha',
        type: 'character',
        scopes: ['some-other-scope.v1'],
      })

      const store = createOwnerStore(
        makeConfig({ requiredScope: 'esi-test.scope.v1' })
      )
      await store.getState().init()
      await store.getState().updateForOwner(ownerNoScope)

      expect(mockFetchData).not.toHaveBeenCalled()
      expect(mockSetOwnerScopesOutdated).toHaveBeenCalledWith(
        'character-1001',
        true
      )
    })

    it('generation counter — clear() causes bail', async () => {
      mockDB.loadAll.mockResolvedValue([])

      let resolveFetch!: () => void
      mockFetchData.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = () =>
              resolve({
                data: [1],
                expiresAt: Date.now() + 300_000,
                etag: null,
              })
          })
      )

      const store = createOwnerStore(makeConfig())
      await store.getState().init()

      const p = store.getState().updateForOwner(ownerA)

      await store.getState().clear()
      resolveFetch()
      await p

      // Data should not have been applied because generation changed
      expect(store.getState().dataByOwner).toHaveLength(0)
    })
  })

  // ── onAfterBatchUpdate ───────────────────────────────────────────────────

  describe('onAfterBatchUpdate', () => {
    it('state is applied before onAfterBatchUpdate fires', async () => {
      mockDB.loadAll.mockResolvedValue([])
      mockFetchData.mockResolvedValue(createESIResponse([7, 8]))
      mockOwners({ 'character-1001': ownerA })

      let capturedData: TestOwnerData[] = []
      let storeDataInsideCallback: TestOwnerData[] = []
      let storeRef: ReturnType<
        typeof createOwnerStore<number[], TestOwnerData>
      > | null = null
      const onAfterBatchUpdate = vi.fn(async (results: TestOwnerData[]) => {
        capturedData = results
        storeDataInsideCallback = storeRef!.getState().dataByOwner
      })

      const store = createOwnerStore(makeConfig({ onAfterBatchUpdate }))
      storeRef = store
      await store.getState().init()
      await store.getState().update(true)

      expect(onAfterBatchUpdate).toHaveBeenCalledTimes(1)
      expect(capturedData).toHaveLength(1)
      expect(capturedData[0]!.items).toEqual([7, 8])

      // Verify state was already set BEFORE the callback fired
      expect(storeDataInsideCallback).toHaveLength(1)
      expect(storeDataInsideCallback[0]!.items).toEqual([7, 8])

      // Verify the store also has the data
      expect(store.getState().dataByOwner).toHaveLength(1)
      expect(store.getState().dataByOwner[0]!.items).toEqual([7, 8])
    })
  })

  // ── removeForOwner ───────────────────────────────────────────────────────

  describe('removeForOwner', () => {
    it('removes owner data and clears expiry cache', async () => {
      mockDB.loadAll.mockResolvedValue([
        { owner: ownerA, data: [1] },
        { owner: ownerB, data: [2] },
      ])

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      expect(store.getState().dataByOwner).toHaveLength(2)

      await store.getState().removeForOwner('character', 1001)

      expect(mockDB.delete).toHaveBeenCalledWith('character-1001')
      expect(mockExpiryCacheState.clearForOwner).toHaveBeenCalledWith(
        'character-1001'
      )
      expect(store.getState().dataByOwner).toHaveLength(1)
      expect(store.getState().dataByOwner[0]!.owner.id).toBe(1002)
    })

    it('no-ops for unknown owner', async () => {
      mockDB.loadAll.mockResolvedValue([{ owner: ownerA, data: [1] }])

      const store = createOwnerStore(makeConfig())
      await store.getState().init()

      await store.getState().removeForOwner('character', 9999)

      expect(mockDB.delete).not.toHaveBeenCalled()
      expect(store.getState().dataByOwner).toHaveLength(1)
    })
  })

  // ── clear ────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('resets all state including initialized flag', async () => {
      mockDB.loadAll.mockResolvedValue([{ owner: ownerA, data: [1] }])

      const store = createOwnerStore(makeConfig())
      await store.getState().init()
      expect(store.getState().initialized).toBe(true)
      expect(store.getState().dataByOwner).toHaveLength(1)

      await store.getState().clear()

      expect(store.getState().initialized).toBe(false)
      expect(store.getState().dataByOwner).toHaveLength(0)
      expect(store.getState().isUpdating).toBe(false)
      expect(store.getState().updateError).toBeNull()
      expect(mockDB.clear).toHaveBeenCalled()
    })

    it('clears updatingOwners set (subsequent updateForOwner works)', async () => {
      mockDB.loadAll.mockResolvedValue([])

      let resolveFetch!: () => void
      mockFetchData.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = () =>
              resolve({
                data: [1],
                expiresAt: Date.now() + 300_000,
                etag: null,
              })
          })
      )

      const store = createOwnerStore(makeConfig())
      await store.getState().init()

      // Start an update that will hold the lock
      const p1 = store.getState().updateForOwner(ownerA)

      // Clear while update is in flight
      await store.getState().clear()

      resolveFetch()
      await p1

      // Now the lock should be released, and we can update again
      mockFetchData.mockResolvedValueOnce(createESIResponse([42]))
      await store.getState().updateForOwner(ownerA)

      expect(store.getState().dataByOwner).toHaveLength(1)
      expect(store.getState().dataByOwner[0]!.items).toEqual([42])
    })
  })

  // ── registration ─────────────────────────────────────────────────────────

  describe('registration', () => {
    it('registers refresh callback with expiry cache (unless disableAutoRefresh)', () => {
      mockExpiryCacheState.registerRefreshCallback.mockClear()
      mockRegister.mockClear()

      createOwnerStore(makeConfig())

      expect(mockExpiryCacheState.registerRefreshCallback).toHaveBeenCalledWith(
        '/test/{owner_id}/items/',
        expect.any(Function)
      )
    })

    it('does not register refresh callback when disableAutoRefresh is true', () => {
      mockExpiryCacheState.registerRefreshCallback.mockClear()

      createOwnerStore(makeConfig({ disableAutoRefresh: true }))

      expect(
        mockExpiryCacheState.registerRefreshCallback
      ).not.toHaveBeenCalled()
    })

    it('registers with store registry', () => {
      mockRegister.mockClear()

      createOwnerStore(makeConfig())

      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestItems',
          removeForOwner: expect.any(Function),
          clear: expect.any(Function),
          getIsUpdating: expect.any(Function),
          init: expect.any(Function),
          update: expect.any(Function),
        })
      )
    })
  })
})
