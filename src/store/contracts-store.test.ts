import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useContractsStore } from './contracts-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {}, ownerHasScope: () => false })),
  },
  ownerKey: (type: string, id: number) => `${type}-${id}`,
  findOwnerByKey: vi.fn(),
}))

vi.mock('./expiry-cache-store', () => ({
  useExpiryCacheStore: {
    getState: vi.fn(() => ({
      isExpired: () => true,
      setExpiry: vi.fn(),
      clearForOwner: vi.fn(),
      registerRefreshCallback: vi.fn(() => vi.fn()),
    })),
  },
}))

vi.mock('@/api/endpoints/contracts', () => ({
  getContractItems: vi.fn(),
  getCorporationContractItems: vi.fn(),
}))

vi.mock('@/api/esi', () => ({
  esi: {
    fetchPaginatedWithMeta: vi.fn(),
    fetchBatch: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('./price-store', () => ({
  usePriceStore: {
    getState: vi.fn(() => ({
      abyssalPrices: new Map<number, number>(),
      marketPrices: new Map<number, number>(),
      getItemPrice: vi.fn((typeId: number) => {
        if (typeId === 34) return 10
        return 0
      }),
      ensureJitaPrices: vi.fn(async () => new Map()),
    })),
  },
  isAbyssalTypeId: vi.fn(() => false),
}))

describe('contracts-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useContractsStore.setState({
      itemsById: new Map(),
      visibilityByOwner: new Map(),
      itemsByContractId: new Map(),
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useContractsStore.getState()
      expect(state.itemsById.size).toBe(0)
      expect(state.visibilityByOwner.size).toBe(0)
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('update', () => {
    it('sets error when no owners logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useContractsStore.getState().update(true)

      expect(useContractsStore.getState().updateError).toBe(
        'No owners logged in'
      )
    })

    it('updates both character and corporation owners', async () => {
      const { useAuthStore, findOwnerByKey } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const charOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      const corpOwner = createMockOwner({
        id: 98000001,
        characterId: 12345,
        name: 'Corp',
        type: 'corporation',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({
          'character-12345': charOwner,
          'corporation-98000001': corpOwner,
        })
      )
      vi.mocked(findOwnerByKey).mockImplementation((key: string) => {
        if (key === 'character-12345') return charOwner
        if (key === 'corporation-98000001') return corpOwner
        return undefined
      })

      vi.mocked(esi.fetchPaginatedWithMeta).mockResolvedValue({
        data: [],
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useContractsStore.getState().update(true)

      expect(useContractsStore.getState().visibilityByOwner.size).toBe(2)
    })

    it('fetches contracts successfully', async () => {
      const { useAuthStore, findOwnerByKey } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-12345': mockOwner })
      )
      vi.mocked(findOwnerByKey).mockReturnValue(mockOwner)

      vi.mocked(esi.fetchPaginatedWithMeta).mockResolvedValue({
        data: [
          {
            contract_id: 1,
            issuer_id: 12345,
            issuer_corporation_id: 98000001,
            assignee_id: 0,
            acceptor_id: 0,
            type: 'courier',
            status: 'outstanding',
            title: 'Test',
            for_corporation: false,
            availability: 'personal',
            date_issued: '2024-01-01T00:00:00Z',
            date_expired: '2024-02-01T00:00:00Z',
            days_to_complete: 7,
            price: 1000000,
            reward: 500000,
            collateral: 2000000,
            start_location_id: 60003760,
            end_location_id: 60003761,
            volume: 10000,
          },
        ],
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useContractsStore.getState().update(true)

      const state = useContractsStore.getState()
      expect(state.itemsById.size).toBe(1)
      expect(state.visibilityByOwner.get('character-12345')?.size).toBe(1)
    })

    it('filters out corporation contracts from character results', async () => {
      const { useAuthStore, findOwnerByKey } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
        corporationId: 98000001,
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-12345': mockOwner })
      )
      vi.mocked(findOwnerByKey).mockReturnValue(mockOwner)

      const personalContract = {
        contract_id: 1,
        issuer_id: 12345,
        issuer_corporation_id: 98000001,
        assignee_id: 0,
        acceptor_id: 0,
        type: 'item_exchange',
        status: 'outstanding',
        availability: 'public',
        for_corporation: false,
        date_issued: new Date().toISOString(),
        date_expired: new Date(Date.now() + 86400000).toISOString(),
      }
      const corpContract = {
        ...personalContract,
        contract_id: 2,
        for_corporation: true,
      }

      vi.mocked(esi.fetchPaginatedWithMeta).mockResolvedValue({
        data: [personalContract as never, corpContract as never],
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useContractsStore.getState().update(true)

      const state = useContractsStore.getState()
      expect(state.itemsById.size).toBe(1)
      expect(state.itemsById.get(1)?.item.for_corporation).toBe(false)
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-12345': mockOwner })
      )

      vi.mocked(esi.fetchPaginatedWithMeta).mockRejectedValue(
        new Error('API Error')
      )

      await useContractsStore.getState().update(true)

      expect(useContractsStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useContractsStore.setState({
        itemsById: new Map([
          [1, { item: {} as never, sourceOwner: {} as never }],
        ]),
        visibilityByOwner: new Map([['test', new Set([1])]]),
        updateError: 'error',
      })

      await useContractsStore.getState().clear()

      const state = useContractsStore.getState()
      expect(state.itemsById.size).toBe(0)
      expect(state.visibilityByOwner.size).toBe(0)
      expect(state.updateError).toBeNull()
    })
  })

  describe('getContractsByOwner', () => {
    it('returns contracts grouped by owner', async () => {
      const { findOwnerByKey } = await import('./auth-store')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      vi.mocked(findOwnerByKey).mockReturnValue(mockOwner)

      const mockContract = {
        contract_id: 1,
        issuer_id: 12345,
        issuer_corporation_id: 98000001,
        assignee_id: 0,
        acceptor_id: 0,
        type: 'item_exchange',
        status: 'outstanding',
        for_corporation: false,
        availability: 'public',
        date_issued: new Date().toISOString(),
        date_expired: new Date(Date.now() + 86400000).toISOString(),
      }

      useContractsStore.setState({
        itemsById: new Map([
          [
            1,
            {
              item: mockContract as never,
              sourceOwner: { type: 'character', id: 12345, characterId: 12345 },
            },
          ],
        ]),
        visibilityByOwner: new Map([['character-12345', new Set([1])]]),
      })

      const result = useContractsStore.getContractsByOwner()

      expect(result).toHaveLength(1)
      expect(result[0]?.owner).toEqual(mockOwner)
      expect(result[0]?.contracts).toHaveLength(1)
      expect(result[0]?.contracts[0]?.contract.contract_id).toBe(1)
    })
  })

  describe('getTotal', () => {
    it('counts each contract only once even if visible to multiple owners', () => {
      const mockContract = {
        contract_id: 1,
        issuer_id: 12345,
        issuer_corporation_id: 98000001,
        assignee_id: 67890,
        acceptor_id: 0,
        type: 'item_exchange',
        status: 'outstanding',
        for_corporation: false,
        availability: 'personal',
        date_issued: new Date().toISOString(),
        date_expired: new Date(Date.now() + 86400000).toISOString(),
        collateral: 1000000,
      }

      const mockItem = {
        record_id: 1,
        type_id: 34,
        quantity: 100,
        is_included: true,
        is_singleton: false,
      }

      useContractsStore.setState({
        itemsById: new Map([
          [
            1,
            {
              item: mockContract as never,
              sourceOwner: { type: 'character', id: 12345, characterId: 12345 },
            },
          ],
        ]),
        itemsByContractId: new Map([[1, [mockItem as never]]]),
        visibilityByOwner: new Map([
          ['character-12345', new Set([1])],
          ['character-67890', new Set([1])],
        ]),
      })

      const total = useContractsStore.getTotal([
        'character-12345',
        'character-67890',
      ])

      expect(total).toBe(1001000)
    })
  })
})
