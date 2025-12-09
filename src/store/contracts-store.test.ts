import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useContractsStore } from './contracts-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
}))

vi.mock('@/api/endpoints/contracts', () => ({
  getCharacterContracts: vi.fn(),
  getContractItems: vi.fn(),
  getPublicContractItems: vi.fn(),
  getCorporationContracts: vi.fn(),
  getCorporationContractItems: vi.fn(),
}))

vi.mock('@/api/esi-client', () => ({
  esiClient: {
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
      lastUpdated: null,
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useContractsStore.getState()
      expect(state.contractsByOwner).toEqual([])
      expect(state.lastUpdated).toBeNull()
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('canUpdate', () => {
    it('returns true when never updated', () => {
      useContractsStore.setState({ lastUpdated: null, isUpdating: false })
      expect(useContractsStore.getState().canUpdate()).toBe(true)
    })

    it('returns false when currently updating', () => {
      useContractsStore.setState({ isUpdating: true })
      expect(useContractsStore.getState().canUpdate()).toBe(false)
    })
  })

  describe('getTimeUntilUpdate', () => {
    it('returns 0 when never updated', () => {
      useContractsStore.setState({ lastUpdated: null })
      expect(useContractsStore.getState().getTimeUntilUpdate()).toBe(0)
    })
  })

  describe('update', () => {
    it('sets error when no characters logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useContractsStore.getState().update(true)

      expect(useContractsStore.getState().updateError).toBe('No characters logged in')
    })

    it('only fetches for character owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterContracts } = await import('@/api/endpoints/contracts')

      const charOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      const corpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({
        'character-12345': charOwner,
        'corporation-98000001': corpOwner,
      }))

      vi.mocked(getCharacterContracts).mockResolvedValue([])

      await useContractsStore.getState().update(true)

      expect(getCharacterContracts).toHaveBeenCalledTimes(1)
    })

    it('fetches contracts successfully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterContracts, getCorporationContracts } = await import('@/api/endpoints/contracts')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterContracts).mockResolvedValue([
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
      ])
      vi.mocked(getCorporationContracts).mockResolvedValue([])

      await useContractsStore.getState().update(true)

      expect(useContractsStore.getState().contractsByOwner).toHaveLength(1)
    })

    it('merges character and corp contracts, deduplicating', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterContracts, getCorporationContracts } = await import('@/api/endpoints/contracts')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      const sharedContract = {
        contract_id: 1,
        type: 'item_exchange',
        status: 'outstanding',
        availability: 'public',
        date_issued: new Date().toISOString(),
      }

      vi.mocked(getCharacterContracts).mockResolvedValue([sharedContract as never])
      vi.mocked(getCorporationContracts).mockResolvedValue([
        sharedContract as never,
        { ...sharedContract, contract_id: 2 } as never,
      ])
      vi.mocked(esiClient.fetchBatch).mockResolvedValue(new Map())

      await useContractsStore.getState().update(true)

      const contracts = useContractsStore.getState().contractsByOwner[0]?.contracts
      expect(contracts).toHaveLength(2)
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterContracts } = await import('@/api/endpoints/contracts')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterContracts).mockRejectedValue(new Error('API Error'))

      await useContractsStore.getState().update(true)

      expect(useContractsStore.getState().contractsByOwner).toHaveLength(0)
      expect(useContractsStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useContractsStore.setState({
        contractsByOwner: [{ owner: {} as never, contracts: [] }],
        lastUpdated: Date.now(),
        updateError: 'error',
      })

      await useContractsStore.getState().clear()

      const state = useContractsStore.getState()
      expect(state.contractsByOwner).toHaveLength(0)
      expect(state.lastUpdated).toBeNull()
      expect(state.updateError).toBeNull()
    })
  })
})
