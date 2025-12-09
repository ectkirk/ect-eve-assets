import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useClonesStore } from './clones-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
}))

vi.mock('@/api/endpoints/clones', () => ({
  getCharacterClones: vi.fn(),
  getCharacterImplants: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('clones-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useClonesStore.setState({
      clonesByOwner: [],
      lastUpdated: null,
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useClonesStore.getState()
      expect(state.clonesByOwner).toEqual([])
      expect(state.lastUpdated).toBeNull()
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('canUpdate', () => {
    it('returns true when never updated', () => {
      useClonesStore.setState({ lastUpdated: null, isUpdating: false })
      expect(useClonesStore.getState().canUpdate()).toBe(true)
    })

    it('returns false when currently updating', () => {
      useClonesStore.setState({ isUpdating: true })
      expect(useClonesStore.getState().canUpdate()).toBe(false)
    })

    it('returns false when updated recently', () => {
      useClonesStore.setState({ lastUpdated: Date.now(), isUpdating: false })
      expect(useClonesStore.getState().canUpdate()).toBe(false)
    })
  })

  describe('getTimeUntilUpdate', () => {
    it('returns 0 when never updated', () => {
      useClonesStore.setState({ lastUpdated: null })
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
      const { getCharacterClones, getCharacterImplants } = await import('@/api/endpoints/clones')

      const charOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      const corpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({
        'character-12345': charOwner,
        'corporation-98000001': corpOwner,
      }))

      vi.mocked(getCharacterClones).mockResolvedValue({
        jump_clones: [],
        home_location: { location_id: 60003760, location_type: 'station' },
      })
      vi.mocked(getCharacterImplants).mockResolvedValue([])

      await useClonesStore.getState().update(true)

      expect(getCharacterClones).toHaveBeenCalledTimes(1)
      expect(getCharacterImplants).toHaveBeenCalledTimes(1)
    })

    it('fetches clones and implants together', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterClones, getCharacterImplants } = await import('@/api/endpoints/clones')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterClones).mockResolvedValue({
        jump_clones: [
          { jump_clone_id: 1, location_id: 60003760, location_type: 'station', implants: [22118] },
        ],
        home_location: { location_id: 60003760, location_type: 'station' },
      })
      vi.mocked(getCharacterImplants).mockResolvedValue([22118, 22119])

      await useClonesStore.getState().update(true)

      expect(useClonesStore.getState().clonesByOwner).toHaveLength(1)
      expect(useClonesStore.getState().clonesByOwner[0]?.activeImplants).toEqual([22118, 22119])
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterClones } = await import('@/api/endpoints/clones')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterClones).mockRejectedValue(new Error('API Error'))

      await useClonesStore.getState().update(true)

      expect(useClonesStore.getState().clonesByOwner).toHaveLength(0)
      expect(useClonesStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useClonesStore.setState({
        clonesByOwner: [{ owner: {} as never, clones: {} as never, activeImplants: [] }],
        lastUpdated: Date.now(),
        updateError: 'error',
      })

      await useClonesStore.getState().clear()

      const state = useClonesStore.getState()
      expect(state.clonesByOwner).toHaveLength(0)
      expect(state.lastUpdated).toBeNull()
      expect(state.updateError).toBeNull()
    })
  })
})
