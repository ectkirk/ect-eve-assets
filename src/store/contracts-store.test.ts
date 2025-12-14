import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useContractsStore } from './contracts-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {}, ownerHasScope: () => false })),
  },
  ownerKey: (type: string, id: number) => `${type}-${id}`,
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

describe('contracts-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useContractsStore.setState({
      contractsByOwner: [],
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useContractsStore.getState()
      expect(state.contractsByOwner).toEqual([])
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

      expect(useContractsStore.getState().updateError).toBe('No owners logged in')
    })

    it('updates both character and corporation owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const charOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      const corpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({
        'character-12345': charOwner,
        'corporation-98000001': corpOwner,
      }))

      vi.mocked(esi.fetchPaginatedWithMeta).mockResolvedValue({
        data: [],
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useContractsStore.getState().update(true)

      expect(useContractsStore.getState().contractsByOwner).toHaveLength(2)
    })

    it('fetches contracts successfully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

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

      expect(useContractsStore.getState().contractsByOwner).toHaveLength(1)
    })

    it('filters out corporation contracts from character results', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
        corporationId: 98000001,
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

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
      vi.mocked(esi.fetchBatch).mockResolvedValue(new Map())

      await useContractsStore.getState().update(true)

      const contracts = useContractsStore.getState().contractsByOwner[0]?.contracts
      expect(contracts).toHaveLength(1)
      expect(contracts?.[0]?.contract.for_corporation).toBe(false)
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esi.fetchPaginatedWithMeta).mockRejectedValue(new Error('API Error'))

      await useContractsStore.getState().update(true)

      expect(useContractsStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useContractsStore.setState({
        contractsByOwner: [{ owner: {} as never, contracts: [] }],
        updateError: 'error',
      })

      await useContractsStore.getState().clear()

      const state = useContractsStore.getState()
      expect(state.contractsByOwner).toHaveLength(0)
      expect(state.updateError).toBeNull()
    })
  })
})
