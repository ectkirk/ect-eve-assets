import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useWalletStore, isCorporationWallet, type OwnerWallet } from './wallet-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
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

vi.mock('@/api/esi', () => ({
  esi: {
    fetchWithMeta: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('wallet-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWalletStore.setState({
      walletsByOwner: [],
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
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
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
    it('sets error when no owners logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useWalletStore.getState().update(true)

      expect(useWalletStore.getState().updateError).toBe('No owners logged in')
    })

    it('fetches character wallet', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esi.fetchWithMeta).mockResolvedValue({
        data: 5000000,
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useWalletStore.getState().update(true)

      expect(esi.fetchWithMeta).toHaveBeenCalled()
      expect(useWalletStore.getState().walletsByOwner).toHaveLength(1)
      expect((useWalletStore.getState().walletsByOwner[0] as { balance: number }).balance).toBe(5000000)
    })

    it('fetches corporation wallets', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockCorpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Test Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'corporation-98000001': mockCorpOwner }))

      vi.mocked(esi.fetchWithMeta).mockResolvedValue({
        data: [
          { division: 1, balance: 10000000 },
          { division: 2, balance: 5000000 },
        ],
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useWalletStore.getState().update(true)

      expect(esi.fetchWithMeta).toHaveBeenCalled()
      expect(useWalletStore.getState().walletsByOwner).toHaveLength(1)
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esi.fetchWithMeta).mockRejectedValue(new Error('API Error'))

      await useWalletStore.getState().update(true)

      expect(useWalletStore.getState().walletsByOwner).toHaveLength(0)
      expect(useWalletStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useWalletStore.setState({
        walletsByOwner: [{ owner: {} as never, balance: 1000000 }],
        updateError: 'error',
      })

      await useWalletStore.getState().clear()

      const state = useWalletStore.getState()
      expect(state.walletsByOwner).toHaveLength(0)
      expect(state.updateError).toBeNull()
    })
  })
})
