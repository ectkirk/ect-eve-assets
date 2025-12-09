import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useWalletStore, isCorporationWallet, type OwnerWallet } from './wallet-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
}))

vi.mock('@/api/endpoints/wallet', () => ({
  getCharacterWallet: vi.fn(),
  getCorporationWallets: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('wallet-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      walletsByOwner: [],
      lastUpdated: null,
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('isCorporationWallet', () => {
    it('returns true for corporation wallets', () => {
      const wallet: OwnerWallet = {
        owner: createMockOwner({ id: 98000001, characterId: 12345, name: 'Corp', type: 'corporation' }),
        divisions: [],
      }
      expect(isCorporationWallet(wallet)).toBe(true)
    })

    it('returns false for character wallets', () => {
      const wallet: OwnerWallet = {
        owner: createMockOwner({ id: 12345, name: 'Char', type: 'character' }),
        balance: 1000000,
      }
      expect(isCorporationWallet(wallet)).toBe(false)
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useWalletStore.getState()
      expect(state.walletsByOwner).toEqual([])
      expect(state.lastUpdated).toBeNull()
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('canUpdate', () => {
    it('returns true when never updated', () => {
      useWalletStore.setState({ lastUpdated: null, isUpdating: false })
      expect(useWalletStore.getState().canUpdate()).toBe(true)
    })

    it('returns false when currently updating', () => {
      useWalletStore.setState({ isUpdating: true })
      expect(useWalletStore.getState().canUpdate()).toBe(false)
    })
  })

  describe('getTimeUntilUpdate', () => {
    it('returns 0 when never updated', () => {
      useWalletStore.setState({ lastUpdated: null })
      expect(useWalletStore.getState().getTimeUntilUpdate()).toBe(0)
    })
  })

  describe('getTotalBalance', () => {
    it('returns 0 when no wallets', () => {
      expect(useWalletStore.getState().getTotalBalance()).toBe(0)
    })

    it('sums character balances', () => {
      useWalletStore.setState({
        walletsByOwner: [
          { owner: createMockOwner({ id: 1, name: 'A', type: 'character' }), balance: 1000000 },
          { owner: createMockOwner({ id: 2, name: 'B', type: 'character' }), balance: 2000000 },
        ],
      })
      expect(useWalletStore.getState().getTotalBalance()).toBe(3000000)
    })

    it('sums corporation division balances', () => {
      useWalletStore.setState({
        walletsByOwner: [
          {
            owner: createMockOwner({ id: 98000001, characterId: 12345, name: 'Corp', type: 'corporation' }),
            divisions: [
              { division: 1, balance: 1000000 },
              { division: 2, balance: 2000000 },
            ],
          },
        ],
      })
      expect(useWalletStore.getState().getTotalBalance()).toBe(3000000)
    })

    it('sums both character and corporation balances', () => {
      useWalletStore.setState({
        walletsByOwner: [
          { owner: createMockOwner({ id: 1, name: 'A', type: 'character' }), balance: 1000000 },
          {
            owner: createMockOwner({ id: 98000001, characterId: 1, name: 'Corp', type: 'corporation' }),
            divisions: [{ division: 1, balance: 5000000 }],
          },
        ],
      })
      expect(useWalletStore.getState().getTotalBalance()).toBe(6000000)
    })
  })

  describe('update', () => {
    it('sets error when no characters logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useWalletStore.getState().update(true)

      expect(useWalletStore.getState().updateError).toBe('No characters logged in')
    })

    it('fetches character wallet', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterWallet } = await import('@/api/endpoints/wallet')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterWallet).mockResolvedValue(5000000)

      await useWalletStore.getState().update(true)

      expect(getCharacterWallet).toHaveBeenCalledWith(12345)
      expect(useWalletStore.getState().walletsByOwner).toHaveLength(1)
      expect((useWalletStore.getState().walletsByOwner[0] as { balance: number }).balance).toBe(5000000)
    })

    it('fetches corporation wallets', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCorporationWallets } = await import('@/api/endpoints/wallet')

      const mockCorpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Test Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'corporation-98000001': mockCorpOwner }))

      vi.mocked(getCorporationWallets).mockResolvedValue([
        { division: 1, balance: 10000000 },
        { division: 2, balance: 5000000 },
      ])

      await useWalletStore.getState().update(true)

      expect(getCorporationWallets).toHaveBeenCalledWith(12345, 98000001)
      expect(useWalletStore.getState().walletsByOwner).toHaveLength(1)
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterWallet } = await import('@/api/endpoints/wallet')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterWallet).mockRejectedValue(new Error('API Error'))

      await useWalletStore.getState().update(true)

      expect(useWalletStore.getState().walletsByOwner).toHaveLength(0)
      expect(useWalletStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useWalletStore.setState({
        walletsByOwner: [{ owner: {} as never, balance: 1000000 }],
        lastUpdated: Date.now(),
        updateError: 'error',
      })

      await useWalletStore.getState().clear()

      const state = useWalletStore.getState()
      expect(state.walletsByOwner).toHaveLength(0)
      expect(state.lastUpdated).toBeNull()
      expect(state.updateError).toBeNull()
    })
  })
})
