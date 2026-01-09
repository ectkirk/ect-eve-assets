import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from '@/store/auth-store'

describe('ESI Token Provider Integration', () => {
  let mockProvideToken: ReturnType<typeof vi.fn>
  let mockRefreshToken: ReturnType<typeof vi.fn>
  let tokenRequestHandler: ((characterId: number) => Promise<void>) | null
  let storage: Record<string, unknown>

  beforeEach(() => {
    useAuthStore.setState({
      owners: {},
      selectedOwnerIds: [],
      isAuthenticated: false,
    })

    mockProvideToken = vi.fn()
    mockRefreshToken = vi.fn()
    tokenRequestHandler = null
    storage = {}

    Object.defineProperty(window, 'electronAPI', {
      value: {
        esi: {
          onRequestToken: (handler: (characterId: number) => Promise<void>) => {
            tokenRequestHandler = handler
            return () => {
              tokenRequestHandler = null
            }
          },
          provideToken: mockProvideToken,
        },
        refreshToken: mockRefreshToken,
        storageGet: vi.fn().mockResolvedValue(storage),
        storageSet: vi
          .fn()
          .mockImplementation((data: Record<string, unknown>) => {
            storage = data
            return Promise.resolve()
          }),
      },
      writable: true,
    })
  })

  async function requestToken(characterId: number) {
    if (tokenRequestHandler) {
      await tokenRequestHandler(characterId)
    }
  }

  describe('token refresh flow', () => {
    it('provides cached token when not expired', async () => {
      const { setupESITokenProvider } = await import('./esi')
      const cleanup = setupESITokenProvider()

      useAuthStore.getState().addOwner({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 300000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      await requestToken(12345)

      expect(mockProvideToken).toHaveBeenCalledWith(12345, 'valid-token')
      expect(mockRefreshToken).not.toHaveBeenCalled()

      cleanup()
    })

    it('refreshes expired token', async () => {
      mockRefreshToken.mockResolvedValue({
        success: true,
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresAt: Date.now() + 1200000,
        scopes: ['esi-assets.read_assets.v1'],
      })

      const { setupESITokenProvider } = await import('./esi')
      const cleanup = setupESITokenProvider()

      useAuthStore.getState().addOwner({
        accessToken: 'expired-token',
        refreshToken: 'old-refresh',
        expiresAt: Date.now() - 1000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      await requestToken(12345)

      expect(mockRefreshToken).toHaveBeenCalledWith('old-refresh', 12345)
      expect(mockProvideToken).toHaveBeenCalledWith(12345, 'new-token')

      const owner = useAuthStore.getState().owners['character-12345']
      expect(owner?.accessToken).toBe('new-token')
      expect(owner?.refreshToken).toBe('new-refresh')

      cleanup()
    })

    it('marks auth failed on hard auth failure', async () => {
      mockRefreshToken.mockResolvedValue({
        success: false,
        isAuthFailure: true,
      })

      const { setupESITokenProvider } = await import('./esi')
      const cleanup = setupESITokenProvider()

      useAuthStore.getState().addOwner({
        accessToken: 'expired-token',
        refreshToken: 'invalid-refresh',
        expiresAt: Date.now() - 1000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      await requestToken(12345)

      expect(mockProvideToken).toHaveBeenCalledWith(12345, null)
      expect(
        useAuthStore.getState().hasOwnerAuthFailed('character-12345')
      ).toBe(true)

      cleanup()
    })

    it('does not mark auth failed on transient failure', async () => {
      mockRefreshToken.mockResolvedValue({
        success: false,
        isAuthFailure: false,
      })

      const { setupESITokenProvider } = await import('./esi')
      const cleanup = setupESITokenProvider()

      useAuthStore.getState().addOwner({
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh',
        expiresAt: Date.now() - 1000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      await requestToken(12345)

      expect(mockProvideToken).toHaveBeenCalledWith(12345, null)
      expect(
        useAuthStore.getState().hasOwnerAuthFailed('character-12345')
      ).toBe(false)

      cleanup()
    })

    it('provides null for unknown character', async () => {
      const { setupESITokenProvider } = await import('./esi')
      const cleanup = setupESITokenProvider()

      await requestToken(99999)

      expect(mockProvideToken).toHaveBeenCalledWith(99999, null)
      expect(mockRefreshToken).not.toHaveBeenCalled()

      cleanup()
    })

    it('skips already-failed auth owners', async () => {
      const { setupESITokenProvider } = await import('./esi')
      const cleanup = setupESITokenProvider()

      useAuthStore.getState().addOwner({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 300000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })
      useAuthStore.getState().setOwnerAuthFailed('character-12345', true)

      await requestToken(12345)

      expect(mockProvideToken).toHaveBeenCalledWith(12345, null)
      expect(mockRefreshToken).not.toHaveBeenCalled()

      cleanup()
    })
  })

  describe('corporation owner token requests', () => {
    it('finds corporation owner by character ID', async () => {
      const { setupESITokenProvider } = await import('./esi')
      const cleanup = setupESITokenProvider()

      useAuthStore.getState().addOwner({
        accessToken: 'corp-token',
        refreshToken: 'corp-refresh',
        expiresAt: Date.now() + 300000,
        owner: {
          id: 98000001,
          type: 'corporation',
          name: 'Test Corp',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      await requestToken(12345)

      expect(mockProvideToken).toHaveBeenCalledWith(12345, 'corp-token')

      cleanup()
    })
  })
})
