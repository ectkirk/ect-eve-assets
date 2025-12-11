import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useClonesStore } from './clones-store'
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
      getTimeUntilExpiry: () => 0,
      setExpiry: vi.fn(),
      clearForOwner: vi.fn(),
    })),
  },
}))

vi.mock('@/api/esi-client', () => ({
  esiClient: {
    fetchWithMeta: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('clones-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useClonesStore.setState({
      clonesByOwner: [],
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useClonesStore.getState()
      expect(state.clonesByOwner).toEqual([])
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('canUpdate', () => {
    it('returns true when there are character owners and expiry cache says expired', async () => {
      const { useAuthStore } = await import('./auth-store')
      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      useClonesStore.setState({ clonesByOwner: [], isUpdating: false })
      expect(useClonesStore.getState().canUpdate()).toBe(true)
    })

    it('returns false when currently updating', () => {
      useClonesStore.setState({ isUpdating: true })
      expect(useClonesStore.getState().canUpdate()).toBe(false)
    })

  })

  describe('getTimeUntilUpdate', () => {
    it('returns 0 when no data cached', () => {
      useClonesStore.setState({ clonesByOwner: [] })
      expect(useClonesStore.getState().getTimeUntilUpdate()).toBe(0)
    })
  })

  describe('update', () => {
    it('sets error when no characters logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useClonesStore.getState().update(true)

      expect(useClonesStore.getState().updateError).toBe('No characters logged in')
    })

    it('only fetches for character owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const charOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      const corpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({
        'character-12345': charOwner,
        'corporation-98000001': corpOwner,
      }))

      vi.mocked(esiClient.fetchWithMeta).mockResolvedValue({
        data: { jump_clones: [], home_location: { location_id: 60003760, location_type: 'station' } },
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useClonesStore.getState().update(true)

      expect(esiClient.fetchWithMeta).toHaveBeenCalledTimes(2)
    })

    it('fetches clones and implants together', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esiClient.fetchWithMeta)
        .mockResolvedValueOnce({
          data: {
            jump_clones: [{ jump_clone_id: 1, location_id: 60003760, location_type: 'station', implants: [22118] }],
            home_location: { location_id: 60003760, location_type: 'station' },
          },
          expiresAt: Date.now() + 300000,
          etag: 'test-etag',
          notModified: false,
        })
        .mockResolvedValueOnce({
          data: [22118, 22119],
          expiresAt: Date.now() + 300000,
          etag: 'test-etag-2',
          notModified: false,
        })

      await useClonesStore.getState().update(true)

      expect(useClonesStore.getState().clonesByOwner).toHaveLength(1)
      expect(useClonesStore.getState().clonesByOwner[0]?.activeImplants).toEqual([22118, 22119])
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esiClient.fetchWithMeta).mockRejectedValue(new Error('API Error'))

      await useClonesStore.getState().update(true)

      expect(useClonesStore.getState().clonesByOwner).toHaveLength(0)
      expect(useClonesStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useClonesStore.setState({
        clonesByOwner: [{ owner: {} as never, clones: {} as never, activeImplants: [] }],
        updateError: 'error',
      })

      await useClonesStore.getState().clear()

      const state = useClonesStore.getState()
      expect(state.clonesByOwner).toHaveLength(0)
      expect(state.updateError).toBeNull()
    })
  })
})
