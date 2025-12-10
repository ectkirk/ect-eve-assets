import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useAssetStore } from './asset-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
}))

vi.mock('@/api/endpoints/assets', () => ({
  getCharacterAssets: vi.fn(),
  getCharacterAssetNames: vi.fn(),
  getCorporationAssetNames: vi.fn(),
}))

vi.mock('@/api/endpoints/corporation', () => ({
  getCorporationAssets: vi.fn(),
}))

vi.mock('@/api/ref-client', () => ({
  fetchPrices: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('asset-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAssetStore.setState({
      assetsByOwner: [],
      assetNames: new Map(),
      prices: new Map(),
      lastUpdated: null,
      isUpdating: false,
      updateError: null,
      updateProgress: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useAssetStore.getState()
      expect(state.assetsByOwner).toEqual([])
      expect(state.assetNames).toBeInstanceOf(Map)
      expect(state.prices).toBeInstanceOf(Map)
      expect(state.lastUpdated).toBeNull()
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('canUpdate', () => {
    it('returns true when never updated', () => {
      useAssetStore.setState({ lastUpdated: null, isUpdating: false })
      expect(useAssetStore.getState().canUpdate()).toBe(true)
    })

    it('returns false when currently updating', () => {
      useAssetStore.setState({ isUpdating: true })
      expect(useAssetStore.getState().canUpdate()).toBe(false)
    })

    it('returns false when updated recently', () => {
      useAssetStore.setState({ lastUpdated: Date.now(), isUpdating: false })
      expect(useAssetStore.getState().canUpdate()).toBe(false)
    })

    it('returns true when cooldown has passed', () => {
      useAssetStore.setState({ lastUpdated: Date.now() - 61 * 60 * 1000, isUpdating: false })
      expect(useAssetStore.getState().canUpdate()).toBe(true)
    })
  })

  describe('getTimeUntilUpdate', () => {
    it('returns 0 when never updated', () => {
      useAssetStore.setState({ lastUpdated: null })
      expect(useAssetStore.getState().getTimeUntilUpdate()).toBe(0)
    })

    it('returns remaining time when in cooldown', () => {
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
      useAssetStore.setState({ lastUpdated: thirtyMinutesAgo })
      const remaining = useAssetStore.getState().getTimeUntilUpdate()
      expect(remaining).toBeGreaterThan(29 * 60 * 1000)
      expect(remaining).toBeLessThanOrEqual(30 * 60 * 1000)
    })

    it('returns 0 when cooldown has passed', () => {
      useAssetStore.setState({ lastUpdated: Date.now() - 2 * 60 * 60 * 1000 })
      expect(useAssetStore.getState().getTimeUntilUpdate()).toBe(0)
    })
  })

  describe('update', () => {
    it('sets error when no characters logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useAssetStore.getState().update(true)

      expect(useAssetStore.getState().updateError).toBe('No characters logged in')
    })

    it('skips update when already updating', async () => {
      useAssetStore.setState({ isUpdating: true })
      const initialState = useAssetStore.getState()

      await useAssetStore.getState().update(true)

      expect(useAssetStore.getState().assetsByOwner).toBe(initialState.assetsByOwner)
    })

    it('shows cooldown message when not forced', async () => {
      useAssetStore.setState({ lastUpdated: Date.now() })

      await useAssetStore.getState().update(false)

      expect(useAssetStore.getState().updateError).toMatch(/Update available in/)
    })

    it('fetches assets for character owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterAssets, getCharacterAssetNames } = await import('@/api/endpoints/assets')
      const { fetchPrices } = await import('@/api/ref-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test Character', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterAssets).mockResolvedValue([
        { item_id: 1, type_id: 34, location_id: 60003760, location_type: 'station', location_flag: 'Hangar', quantity: 100, is_singleton: false },
      ])
      vi.mocked(getCharacterAssetNames).mockResolvedValue([])
      vi.mocked(fetchPrices).mockResolvedValue(new Map([[34, 5]]))

      await useAssetStore.getState().update(true)

      expect(getCharacterAssets).toHaveBeenCalledWith(12345, 12345)
      expect(useAssetStore.getState().assetsByOwner).toHaveLength(1)
      expect(useAssetStore.getState().isUpdating).toBe(false)
    })

    it('fetches assets for corporation owners', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCorporationAssets } = await import('@/api/endpoints/corporation')
      const { fetchPrices } = await import('@/api/ref-client')

      const mockCorpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Test Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'corporation-98000001': mockCorpOwner }))

      vi.mocked(getCorporationAssets).mockResolvedValue([])
      vi.mocked(fetchPrices).mockResolvedValue(new Map())

      await useAssetStore.getState().update(true)

      expect(getCorporationAssets).toHaveBeenCalledWith(98000001, 12345)
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterAssets } = await import('@/api/endpoints/assets')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterAssets).mockRejectedValue(new Error('API Error'))

      await useAssetStore.getState().update(true)

      expect(useAssetStore.getState().assetsByOwner).toHaveLength(0)
      expect(useAssetStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useAssetStore.setState({
        assetsByOwner: [{ owner: {} as never, assets: [] }],
        assetNames: new Map([[1, 'test']]),
        prices: new Map([[34, 5]]),
        lastUpdated: Date.now(),
        updateError: 'some error',
      })

      await useAssetStore.getState().clear()

      const state = useAssetStore.getState()
      expect(state.assetsByOwner).toHaveLength(0)
      expect(state.assetNames.size).toBe(0)
      expect(state.prices.size).toBe(0)
      expect(state.lastUpdated).toBeNull()
      expect(state.updateError).toBeNull()
    })
  })
})
