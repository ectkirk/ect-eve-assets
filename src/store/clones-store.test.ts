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

describe('clones-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useClonesStore.setState({
      dataByOwner: [],
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useClonesStore.getState()
      expect(state.dataByOwner).toEqual([])
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('update', () => {
    it('does nothing when no characters logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useClonesStore.getState().update(true)

      expect(useClonesStore.getState().updateError).toBeNull()
      expect(useClonesStore.getState().isUpdating).toBe(false)
    })

    it('only fetches for character owners', async () => {
      const { useAuthStore } = await import('./auth-store')
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

      vi.mocked(esi.fetchWithMeta).mockResolvedValue({
        data: {
          jump_clones: [],
          home_location: { location_id: 60003760, location_type: 'station' },
        },
        expiresAt: Date.now() + 300000,
        etag: 'test-etag',
        notModified: false,
      })

      await useClonesStore.getState().update(true)

      expect(esi.fetchWithMeta).toHaveBeenCalledTimes(2)
    })

    it('fetches clones and implants together', async () => {
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

      vi.mocked(esi.fetchWithMeta)
        .mockResolvedValueOnce({
          data: {
            jump_clones: [
              {
                jump_clone_id: 1,
                location_id: 60003760,
                location_type: 'station',
                implants: [22118],
              },
            ],
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

      expect(useClonesStore.getState().dataByOwner).toHaveLength(1)
      expect(useClonesStore.getState().dataByOwner[0]?.activeImplants).toEqual([
        22118, 22119,
      ])
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

      vi.mocked(esi.fetchWithMeta).mockRejectedValue(new Error('API Error'))

      await useClonesStore.getState().update(true)

      expect(useClonesStore.getState().dataByOwner).toHaveLength(0)
      expect(useClonesStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useClonesStore.setState({
        dataByOwner: [
          { owner: {} as never, clones: {} as never, activeImplants: [] },
        ],
        updateError: 'error',
      })

      await useClonesStore.getState().clear()

      const state = useClonesStore.getState()
      expect(state.dataByOwner).toHaveLength(0)
      expect(state.updateError).toBeNull()
    })
  })
})
