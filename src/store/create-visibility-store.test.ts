import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  createMockOwner,
  createESIResponse,
  createMockAuthState,
} from '@/test/helpers'
import type { Owner } from './auth-store'
import type { StoredItem, SourceOwner } from '@/lib/visibility-indexed-db'

// ---------- types for our synthetic store ----------

interface TestItem {
  id: number
  name: string
}

interface TestStoredItem extends StoredItem<TestItem> {
  item: TestItem
  sourceOwner: SourceOwner
}

// ---------- mocks ----------

const mockDB = {
  loadAll: vi.fn(async () => ({
    items: new Map<number, TestStoredItem>(),
    visibility: new Map<string, Set<number>>(),
  })),
  saveItems: vi.fn(async () => {}),
  saveVisibility: vi.fn(async () => {}),
  deleteItems: vi.fn(async () => {}),
  deleteVisibility: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
}

vi.mock('@/lib/visibility-indexed-db', () => ({
  createVisibilityDB: vi.fn(() => mockDB),
}))

vi.mock('./auth-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('./auth-store')>()
  return {
    ...original,
    useAuthStore: {
      getState: vi.fn(() => ({ owners: {} })),
    },
    ownerKey: (type: string, id: number) => `${type}-${id}`,
    findOwnerByKey: vi.fn(),
  }
})

vi.mock('./expiry-cache-store', () => ({
  useExpiryCacheStore: {
    getState: vi.fn(() => ({
      isExpired: vi.fn(() => true),
      setExpiry: vi.fn(),
      clearForOwner: vi.fn(),
      registerRefreshCallback: vi.fn(() => vi.fn()),
    })),
  },
}))

vi.mock('@/lib/data-resolver', () => ({
  triggerResolution: vi.fn(),
}))

vi.mock('./store-registry', () => ({
  useStoreRegistry: {
    getState: vi.fn(() => ({
      register: vi.fn(),
    })),
  },
}))

// ---------- helpers ----------

function makeItem(id: number, name = `item-${id}`): TestItem {
  return { id, name }
}

function makeStoredItem(owner: Owner, item: TestItem): TestStoredItem {
  return {
    item,
    sourceOwner: {
      type: owner.type,
      id: owner.id,
      characterId: owner.characterId,
    },
  }
}

type TestConfig = import('./create-visibility-store').VisibilityStoreConfig<
  TestItem,
  TestStoredItem
>

const defaultConfig = (): TestConfig => ({
  name: 'TestItems',
  moduleName: 'test',
  endpointPattern: '/test/{owner_id}/items/',
  dbName: 'test-items-db',
  itemStoreName: 'items',
  itemKeyName: 'id',
  getEndpoint: (owner: Owner) => `/test/${owner.type}/${owner.id}/items/`,
  getItemId: (item: TestItem) => item.id,
  fetchData: vi.fn(async (_owner: Owner) => createESIResponse<TestItem[]>([])),
  toStoredItem: (owner: Owner, item: TestItem): TestStoredItem =>
    makeStoredItem(owner, item),
})

// ---------- tests ----------

let createVisibilityStore: typeof import('./create-visibility-store').createVisibilityStore

beforeEach(async () => {
  vi.clearAllMocks()

  // Reset mock DB defaults
  mockDB.loadAll.mockResolvedValue({
    items: new Map<number, TestStoredItem>(),
    visibility: new Map<string, Set<number>>(),
  })
  mockDB.saveItems.mockResolvedValue(undefined)
  mockDB.saveVisibility.mockResolvedValue(undefined)
  mockDB.deleteItems.mockResolvedValue(undefined)
  mockDB.deleteVisibility.mockResolvedValue(undefined)
  mockDB.clear.mockResolvedValue(undefined)

  // Re-import to get fresh closure state (initPromise, storeGeneration, updatingOwners)
  vi.resetModules()

  // Re-apply mocks after resetModules
  vi.doMock('@/lib/visibility-indexed-db', () => ({
    createVisibilityDB: vi.fn(() => mockDB),
  }))
  vi.doMock('./auth-store', () => ({
    useAuthStore: {
      getState: vi.fn(() => ({ owners: {} })),
    },
    ownerKey: (type: string, id: number) => `${type}-${id}`,
    findOwnerByKey: vi.fn(),
  }))
  vi.doMock('./expiry-cache-store', () => ({
    useExpiryCacheStore: {
      getState: vi.fn(() => ({
        isExpired: vi.fn(() => true),
        setExpiry: vi.fn(),
        clearForOwner: vi.fn(),
        registerRefreshCallback: vi.fn(() => vi.fn()),
      })),
    },
  }))
  vi.doMock('@/lib/data-resolver', () => ({
    triggerResolution: vi.fn(),
  }))
  vi.doMock('./store-registry', () => ({
    useStoreRegistry: {
      getState: vi.fn(() => ({
        register: vi.fn(),
      })),
    },
  }))
  vi.doMock('@/lib/logger', () => ({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }))

  const mod = await import('./create-visibility-store')
  createVisibilityStore = mod.createVisibilityStore
})

describe('createVisibilityStore', () => {
  // ======== describe('init') ========
  describe('init', () => {
    it('loads items and visibility from DB', async () => {
      const item = makeItem(1)
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      const stored = makeStoredItem(owner, item)

      mockDB.loadAll.mockResolvedValueOnce({
        items: new Map([[1, stored]]),
        visibility: new Map([['character-100', new Set([1])]]),
      })

      const store = createVisibilityStore(defaultConfig())
      await store.getState().init()

      const state = store.getState()
      expect(state.initialized).toBe(true)
      expect(state.itemsById.size).toBe(1)
      expect(state.itemsById.get(1)).toEqual(stored)
      expect(state.visibilityByOwner.get('character-100')).toEqual(new Set([1]))
    })

    it('is idempotent', async () => {
      const store = createVisibilityStore(defaultConfig())
      await store.getState().init()
      await store.getState().init()
      expect(mockDB.loadAll).toHaveBeenCalledTimes(1)
    })

    it('resets initPromise on failure allowing retry', async () => {
      mockDB.loadAll
        .mockRejectedValueOnce(new Error('DB fail'))
        .mockResolvedValueOnce({
          items: new Map(),
          visibility: new Map(),
        })

      const store = createVisibilityStore(defaultConfig())
      await store.getState().init()
      // First init fails, sets initialized=true but no data
      expect(store.getState().initialized).toBe(true)

      // Reset initialized to false to allow retry (the factory sets initialized=true even on error)
      // The initPromise was set to null on error, so clear() + re-init should work
      await store.getState().clear()
      await store.getState().init()
      expect(mockDB.loadAll).toHaveBeenCalledTimes(2)
    })

    it('calls onAfterInit with loaded items', async () => {
      const onAfterInit = vi.fn()
      const item = makeItem(1)
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      const stored = makeStoredItem(owner, item)

      mockDB.loadAll.mockResolvedValueOnce({
        items: new Map([[1, stored]]),
        visibility: new Map([['character-100', new Set([1])]]),
      })

      const config = { ...defaultConfig(), onAfterInit }
      const store = createVisibilityStore(config)
      await store.getState().init()

      expect(onAfterInit).toHaveBeenCalledTimes(1)
      expect(onAfterInit).toHaveBeenCalledWith(new Map([[1, stored]]))
    })
  })

  // ======== describe('update') ========
  describe('update', () => {
    it('calls init first if not initialized', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      const store = createVisibilityStore(defaultConfig())
      expect(store.getState().initialized).toBe(false)

      await store.getState().update()

      expect(store.getState().initialized).toBe(true)
      expect(mockDB.loadAll).toHaveBeenCalledTimes(1)
    })

    it('skips when already updating', async () => {
      const { useAuthStore } = await import('./auth-store')
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )

      let resolveFirst: () => void
      const firstCallPromise = new Promise<void>((r) => {
        resolveFirst = r
      })

      const config = defaultConfig()
      config.fetchData = vi.fn(
        () =>
          new Promise<{
            data: TestItem[]
            expiresAt: number
            etag: string | null
          }>((resolve) => {
            firstCallPromise.then(() =>
              resolve(createESIResponse<TestItem[]>([]))
            )
          })
      )

      const store = createVisibilityStore(config)
      await store.getState().init()

      const p1 = store.getState().update(true)
      // isUpdating should now be true
      const p2 = store.getState().update(true)

      resolveFirst!()
      await Promise.all([p1, p2])

      expect(config.fetchData).toHaveBeenCalledTimes(1)
    })

    it('sets error when no owners logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      const store = createVisibilityStore(defaultConfig())
      await store.getState().init()
      await store.getState().update()

      expect(store.getState().updateError).toBe('No owners logged in')
    })

    it('skips non-expired owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { useExpiryCacheStore } = await import('./expiry-cache-store')

      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )
      vi.mocked(useExpiryCacheStore.getState).mockReturnValue({
        isExpired: vi.fn(() => false),
        setExpiry: vi.fn(),
        clearForOwner: vi.fn(),
        registerRefreshCallback: vi.fn(() => vi.fn()),
      } as never)

      const config = defaultConfig()
      const store = createVisibilityStore(config)
      await store.getState().init()
      await store.getState().update() // force=false, non-expired

      expect(config.fetchData).not.toHaveBeenCalled()
    })

    it('force=true bypasses expiry', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { useExpiryCacheStore } = await import('./expiry-cache-store')

      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )
      vi.mocked(useExpiryCacheStore.getState).mockReturnValue({
        isExpired: vi.fn(() => false),
        setExpiry: vi.fn(),
        clearForOwner: vi.fn(),
        registerRefreshCallback: vi.fn(() => vi.fn()),
      } as never)

      const config = defaultConfig()
      config.fetchData = vi.fn(async () =>
        createESIResponse<TestItem[]>([makeItem(1)])
      )

      const store = createVisibilityStore(config)
      await store.getState().init()
      await store.getState().update(true)

      expect(config.fetchData).toHaveBeenCalledTimes(1)
    })

    it('fetches data, saves items and visibility to DB', async () => {
      const { useAuthStore } = await import('./auth-store')
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )

      const item1 = makeItem(1, 'Tritanium')
      const config = defaultConfig()
      config.fetchData = vi.fn(async () =>
        createESIResponse<TestItem[]>([item1])
      )

      const store = createVisibilityStore(config)
      await store.getState().init()
      await store.getState().update(true)

      const state = store.getState()
      expect(state.itemsById.size).toBe(1)
      expect(state.itemsById.get(1)?.item).toEqual(item1)
      expect(state.visibilityByOwner.get('character-100')).toEqual(new Set([1]))
      expect(mockDB.saveItems).toHaveBeenCalled()
      expect(mockDB.saveVisibility).toHaveBeenCalledWith(
        'character-100',
        new Set([1])
      )
    })

    it('merges new items with existing', async () => {
      const { useAuthStore } = await import('./auth-store')
      const ownerA = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      const ownerB = createMockOwner({
        id: 200,
        name: 'Bob',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({
          'character-100': ownerA,
          'character-200': ownerB,
        })
      )

      const itemA = makeItem(1, 'ItemA')
      const itemB = makeItem(2, 'ItemB')

      const config = defaultConfig()
      config.shouldDeleteStaleItems = false
      config.fetchData = vi.fn(async (owner: Owner) => {
        if (owner.id === 100) return createESIResponse([itemA])
        return createESIResponse([itemB])
      })

      const store = createVisibilityStore(config)
      await store.getState().init()

      // Pre-populate owner A's items
      store.setState({
        itemsById: new Map([[1, makeStoredItem(ownerA, itemA)]]),
        visibilityByOwner: new Map([['character-100', new Set([1])]]),
      })

      // Now update only owner B (make A non-expired)
      const { useExpiryCacheStore } = await import('./expiry-cache-store')
      vi.mocked(useExpiryCacheStore.getState).mockReturnValue({
        isExpired: vi.fn((ownerKey: string) => ownerKey === 'character-200'),
        setExpiry: vi.fn(),
        clearForOwner: vi.fn(),
        registerRefreshCallback: vi.fn(() => vi.fn()),
      } as never)

      await store.getState().update()

      const state = store.getState()
      expect(state.itemsById.size).toBe(2)
      expect(state.itemsById.get(1)?.item.name).toBe('ItemA')
      expect(state.itemsById.get(2)?.item.name).toBe('ItemB')
    })

    it('handles per-owner errors, tracks failedOwners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const ownerA = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      const ownerB = createMockOwner({
        id: 200,
        name: 'Bob',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({
          'character-100': ownerA,
          'character-200': ownerB,
        })
      )

      const config = defaultConfig()
      config.shouldDeleteStaleItems = false
      config.fetchData = vi.fn(async (owner: Owner) => {
        if (owner.id === 100) throw new Error('API fail')
        return createESIResponse([makeItem(2)])
      })

      const store = createVisibilityStore(config)
      await store.getState().init()
      await store.getState().update(true)

      const state = store.getState()
      expect(state.failedOwners).toContain('character-100')
      expect(state.failedOwners).not.toContain('character-200')
      expect(state.updateError).toBe(
        'Failed to fetch TestItems for some owners'
      )
      expect(state.itemsById.get(2)).toBeDefined()
    })

    it('stale item cleanup removes items not in any visibility set', async () => {
      const { useAuthStore } = await import('./auth-store')
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )

      const config = defaultConfig()
      config.shouldDeleteStaleItems = true
      config.fetchData = vi.fn(async () => createESIResponse([makeItem(2)]))

      const store = createVisibilityStore(config)
      await store.getState().init()

      // Pre-populate a stale item (id=1) not returned by fetch
      const staleStored = makeStoredItem(owner, makeItem(1, 'Stale'))
      store.setState({
        itemsById: new Map([[1, staleStored]]),
        visibilityByOwner: new Map([['character-100', new Set([1])]]),
      })

      await store.getState().update(true)

      const state = store.getState()
      // Item 1 is not in the new visibility (only item 2 is), so it's stale
      expect(state.itemsById.has(1)).toBe(false)
      expect(state.itemsById.has(2)).toBe(true)
      expect(mockDB.deleteItems).toHaveBeenCalledWith([1])
    })

    it('shouldUpdateExisting replaces existing item data', async () => {
      const { useAuthStore } = await import('./auth-store')
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )

      const config = defaultConfig()
      config.shouldUpdateExisting = true
      config.fetchData = vi.fn(async () =>
        createESIResponse([makeItem(1, 'Updated')])
      )

      const store = createVisibilityStore(config)
      await store.getState().init()

      // Pre-populate with old version
      store.setState({
        itemsById: new Map([[1, makeStoredItem(owner, makeItem(1, 'Old'))]]),
        visibilityByOwner: new Map([['character-100', new Set([1])]]),
      })

      await store.getState().update(true)

      expect(store.getState().itemsById.get(1)?.item.name).toBe('Updated')
    })
  })

  // ======== describe('update concurrency') ========
  describe('update concurrency', () => {
    it('shared updatingOwners guard', async () => {
      const { useAuthStore } = await import('./auth-store')
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )

      let resolveFirst!: () => void
      const gate = new Promise<void>((r) => {
        resolveFirst = r
      })

      const config = defaultConfig()
      let callCount = 0
      config.fetchData = vi.fn(async () => {
        callCount++
        if (callCount === 1) await gate
        return createESIResponse([makeItem(callCount)])
      })

      const store = createVisibilityStore(config)
      await store.getState().init()

      // Start update, which will block on the gate in fetchData
      const p1 = store.getState().update(true)

      // Wait a tick so the first update enters fetchData
      await new Promise((r) => setTimeout(r, 10))

      // Start updateForOwner for the same owner — should be skipped due to updatingOwners guard
      const p2 = store.getState().updateForOwner(owner)

      resolveFirst()
      await Promise.all([p1, p2])

      // fetchData called only once because the second call was guarded
      expect(config.fetchData).toHaveBeenCalledTimes(1)
    })

    it('generation counter — clear() cancels in-flight update for subsequent owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const ownerA = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      const ownerB = createMockOwner({
        id: 200,
        name: 'Bob',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({
          'character-100': ownerA,
          'character-200': ownerB,
        })
      )

      let resolveFetchA!: () => void
      const gateA = new Promise<void>((r) => {
        resolveFetchA = r
      })

      const config = defaultConfig()
      config.shouldDeleteStaleItems = false
      let fetchCalls = 0
      config.fetchData = vi.fn(async (owner: Owner) => {
        fetchCalls++
        if (owner.id === 100) {
          await gateA
          return createESIResponse([makeItem(1)])
        }
        return createESIResponse([makeItem(2)])
      })

      const store = createVisibilityStore(config)
      await store.getState().init()

      const updatePromise = store.getState().update(true)

      // Wait for the update to start and block on ownerA's fetch
      await new Promise((r) => setTimeout(r, 10))

      // clear() increments generation — ownerB should be skipped
      await store.getState().clear()

      resolveFetchA()
      await updatePromise

      // ownerA's fetch completed but ownerB was never fetched due to generation check
      expect(fetchCalls).toBe(1)
    })
  })

  // ======== describe('updateForOwner') ========
  describe('updateForOwner', () => {
    it('calls init first', async () => {
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })

      const config = defaultConfig()
      config.fetchData = vi.fn(async () => createESIResponse([makeItem(1)]))
      config.shouldDeleteStaleItems = false

      const store = createVisibilityStore(config)
      expect(store.getState().initialized).toBe(false)

      await store.getState().updateForOwner(owner)

      expect(store.getState().initialized).toBe(true)
      expect(mockDB.loadAll).toHaveBeenCalledTimes(1)
    })

    it('updatingOwners guard', async () => {
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })

      let resolveFetch!: () => void
      const gate = new Promise<void>((r) => {
        resolveFetch = r
      })

      const config = defaultConfig()
      config.shouldDeleteStaleItems = false
      config.fetchData = vi.fn(async () => {
        await gate
        return createESIResponse([makeItem(1)])
      })

      const store = createVisibilityStore(config)
      await store.getState().init()

      const p1 = store.getState().updateForOwner(owner)
      await new Promise((r) => setTimeout(r, 10))
      const p2 = store.getState().updateForOwner(owner)

      resolveFetch()
      await Promise.all([p1, p2])

      expect(config.fetchData).toHaveBeenCalledTimes(1)
    })

    it('calls onBeforeOwnerUpdate and onAfterOwnerUpdate hooks', async () => {
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })

      const onBeforeOwnerUpdate = vi.fn()
      const onAfterOwnerUpdate = vi.fn()

      const config = defaultConfig()
      config.shouldDeleteStaleItems = false
      config.onBeforeOwnerUpdate = onBeforeOwnerUpdate
      config.onAfterOwnerUpdate = onAfterOwnerUpdate
      config.fetchData = vi.fn(async () => createESIResponse([makeItem(1)]))

      const store = createVisibilityStore(config)
      await store.getState().init()
      await store.getState().updateForOwner(owner)

      expect(onBeforeOwnerUpdate).toHaveBeenCalledTimes(1)
      expect(onBeforeOwnerUpdate).toHaveBeenCalledWith(
        owner,
        new Set(),
        expect.any(Map)
      )

      expect(onAfterOwnerUpdate).toHaveBeenCalledTimes(1)
      expect(onAfterOwnerUpdate).toHaveBeenCalledWith({
        owner,
        newItems: [makeItem(1)],
        previousVisibility: new Set(),
        itemsById: expect.any(Map),
      })
    })

    it('generation counter cancellation', async () => {
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })

      let resolveFetch!: () => void
      const gate = new Promise<void>((r) => {
        resolveFetch = r
      })

      const config = defaultConfig()
      config.shouldDeleteStaleItems = false
      config.fetchData = vi.fn(async () => {
        await gate
        return createESIResponse([makeItem(1)])
      })

      const store = createVisibilityStore(config)
      await store.getState().init()

      const updatePromise = store.getState().updateForOwner(owner)
      await new Promise((r) => setTimeout(r, 10))

      await store.getState().clear()

      resolveFetch()
      await updatePromise

      expect(store.getState().itemsById.size).toBe(0)
    })

    it('stale item cleanup after single owner update', async () => {
      const ownerA = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })

      const config = defaultConfig()
      config.shouldDeleteStaleItems = true
      // Update returns only item 2, so item 1 (only visible to ownerA) becomes stale
      config.fetchData = vi.fn(async () => createESIResponse([makeItem(2)]))

      const store = createVisibilityStore(config)
      await store.getState().init()

      // Pre-populate: item 1 visible only to ownerA
      store.setState({
        itemsById: new Map([[1, makeStoredItem(ownerA, makeItem(1))]]),
        visibilityByOwner: new Map([['character-100', new Set([1])]]),
      })

      await store.getState().updateForOwner(ownerA)

      const state = store.getState()
      expect(state.itemsById.has(1)).toBe(false)
      expect(state.itemsById.has(2)).toBe(true)
      expect(mockDB.deleteItems).toHaveBeenCalledWith([1])
    })
  })

  // ======== describe('onAfterBatchUpdate') ========
  describe('onAfterBatchUpdate', () => {
    it('state is applied before callback fires', async () => {
      const { useAuthStore } = await import('./auth-store')
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )

      let capturedItems: Map<number, TestStoredItem> | undefined

      const config = defaultConfig()
      config.fetchData = vi.fn(async () => createESIResponse([makeItem(1)]))
      config.onAfterBatchUpdate = (itemsById) => {
        capturedItems = itemsById
      }

      const store = createVisibilityStore(config)
      await store.getState().init()
      await store.getState().update(true)

      expect(capturedItems).toBeDefined()
      expect(capturedItems!.size).toBe(1)
      expect(capturedItems!.get(1)?.item).toEqual(makeItem(1))
      // Verify the store also has the data
      expect(store.getState().itemsById.size).toBe(1)
    })
  })

  // ======== describe('removeForOwner') ========
  describe('removeForOwner', () => {
    it('removes visibility and stale items', async () => {
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })

      const config = defaultConfig()
      config.shouldDeleteStaleItems = true

      const store = createVisibilityStore(config)
      await store.getState().init()

      // Set up: item 1 visible only to Alice
      store.setState({
        itemsById: new Map([[1, makeStoredItem(owner, makeItem(1))]]),
        visibilityByOwner: new Map([['character-100', new Set([1])]]),
      })

      await store.getState().removeForOwner('character', 100)

      const state = store.getState()
      expect(state.visibilityByOwner.has('character-100')).toBe(false)
      expect(state.itemsById.has(1)).toBe(false)
      expect(mockDB.deleteVisibility).toHaveBeenCalledWith('character-100')
      expect(mockDB.deleteItems).toHaveBeenCalledWith([1])
    })

    it('no-ops for unknown owner', async () => {
      const config = defaultConfig()
      const store = createVisibilityStore(config)
      await store.getState().init()

      await store.getState().removeForOwner('character', 999)

      expect(mockDB.deleteVisibility).not.toHaveBeenCalled()
      expect(mockDB.deleteItems).not.toHaveBeenCalled()
    })
  })

  // ======== describe('clear') ========
  describe('clear', () => {
    it('resets all state', async () => {
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })

      const config = defaultConfig()
      const store = createVisibilityStore(config)
      await store.getState().init()

      store.setState({
        itemsById: new Map([[1, makeStoredItem(owner, makeItem(1))]]),
        visibilityByOwner: new Map([['character-100', new Set([1])]]),
        isUpdating: true,
        updateError: 'some error',
        failedOwners: ['character-100'],
      })

      await store.getState().clear()

      const state = store.getState()
      expect(state.itemsById.size).toBe(0)
      expect(state.visibilityByOwner.size).toBe(0)
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.failedOwners).toEqual([])
      expect(state.initialized).toBe(false)
      expect(mockDB.clear).toHaveBeenCalled()
    })

    it('clears updatingOwners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const owner = createMockOwner({
        id: 100,
        name: 'Alice',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-100': owner })
      )

      let resolveFetch!: () => void
      const gate = new Promise<void>((r) => {
        resolveFetch = r
      })

      const config = defaultConfig()
      config.shouldDeleteStaleItems = false
      let fetchCallCount = 0
      config.fetchData = vi.fn(async () => {
        fetchCallCount++
        if (fetchCallCount === 1) await gate
        return createESIResponse([makeItem(fetchCallCount)])
      })

      const store = createVisibilityStore(config)
      await store.getState().init()

      // Start an update that blocks
      const p1 = store.getState().update(true)
      await new Promise((r) => setTimeout(r, 10))

      // clear() should release the updatingOwners guard
      await store.getState().clear()

      resolveFetch()
      await p1

      // Now another update should be able to fetch for the same owner
      await store.getState().init()
      await store.getState().update(true)

      // fetchData should have been called at least twice (once per update attempt)
      expect(fetchCallCount).toBeGreaterThanOrEqual(2)
    })
  })

  // ======== describe('registration') ========
  describe('registration', () => {
    it('registers refresh callback', async () => {
      const { useExpiryCacheStore } = await import('./expiry-cache-store')
      const registerRefreshCallback = vi.fn(() => vi.fn())
      vi.mocked(useExpiryCacheStore.getState).mockReturnValue({
        isExpired: vi.fn(() => true),
        setExpiry: vi.fn(),
        clearForOwner: vi.fn(),
        registerRefreshCallback,
      } as never)

      const config = defaultConfig()
      createVisibilityStore(config)

      expect(registerRefreshCallback).toHaveBeenCalledWith(
        config.endpointPattern,
        expect.any(Function)
      )
    })

    it('registers with store registry', async () => {
      const { useStoreRegistry } = await import('./store-registry')
      const register = vi.fn()
      vi.mocked(useStoreRegistry.getState).mockReturnValue({
        register,
      } as never)

      const config = defaultConfig()
      createVisibilityStore(config)

      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({
          name: config.name,
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
