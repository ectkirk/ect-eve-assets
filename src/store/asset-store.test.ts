import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useAssetStore } from './asset-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
}))

vi.mock('@/api/esi-client', () => ({
  esiClient: {
    fetchWithPaginationMeta: vi.fn(),
  },
  ESI_BASE_URL: 'https://esi.evetech.net',
  ESI_COMPATIBILITY_DATE: '2025-11-06',
  ESI_USER_AGENT: 'test',
}))

vi.mock('@/api/endpoints/assets', () => ({
  getCharacterAssetNames: vi.fn(),
  getCorporationAssetNames: vi.fn(),
}))

vi.mock('@/api/ref-client', () => ({
  fetchPrices: vi.fn(),
  resolveTypes: vi.fn(),
}))

vi.mock('@/api/mutamarket-client', () => ({
  fetchAbyssalPrices: vi.fn(),
  isAbyssalTypeId: vi.fn(() => false),
  hasCachedAbyssalPrice: vi.fn(() => true),
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
      isUpdating: false,
      updateError: null,
      updateProgress: null,
      initialized: false,
    })
    useExpiryCacheStore.setState({
      endpoints: new Map(),
      initialized: true,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useAssetStore.getState()
      expect(state.assetsByOwner).toEqual([])
      expect(state.assetNames).toBeInstanceOf(Map)
      expect(state.prices).toBeInstanceOf(Map)
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('canUpdate (expiry-based)', () => {
    it('returns false when currently updating', () => {
      useAssetStore.setState({ isUpdating: true })
      expect(useAssetStore.getState().canUpdate()).toBe(false)
    })

    it('returns true when no expiry data exists (first time)', async () => {
      const { useAuthStore } = await import('./auth-store')
      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      useAssetStore.setState({ isUpdating: false })
      useExpiryCacheStore.setState({ endpoints: new Map() })

      expect(useAssetStore.getState().canUpdate()).toBe(true)
    })

    it('returns false when data is not expired', async () => {
      const { useAuthStore } = await import('./auth-store')
      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      useAssetStore.setState({
        isUpdating: false,
        assetsByOwner: [{ owner: mockOwner, assets: [] }],
      })

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/assets/', { expiresAt: Date.now() + 60000, etag: null }],
        ]),
        initialized: true,
      })

      expect(useAssetStore.getState().canUpdate()).toBe(false)
    })

    it('returns true when data is expired', async () => {
      const { useAuthStore } = await import('./auth-store')
      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      useAssetStore.setState({
        isUpdating: false,
        assetsByOwner: [{ owner: mockOwner, assets: [] }],
      })

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/assets/', { expiresAt: Date.now() - 1000, etag: null }],
        ]),
        initialized: true,
      })

      expect(useAssetStore.getState().canUpdate()).toBe(true)
    })
  })

  describe('getTimeUntilUpdate', () => {
    it('returns 0 when no owners', () => {
      useAssetStore.setState({ assetsByOwner: [] })
      expect(useAssetStore.getState().getTimeUntilUpdate()).toBe(0)
    })

    it('returns remaining time until expiry', async () => {
      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      useAssetStore.setState({
        assetsByOwner: [{ owner: mockOwner, assets: [] }],
      })

      const futureExpiry = Date.now() + 30000
      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/assets/', { expiresAt: futureExpiry, etag: null }],
        ]),
        initialized: true,
      })

      const remaining = useAssetStore.getState().getTimeUntilUpdate()
      expect(remaining).toBeGreaterThan(29000)
      expect(remaining).toBeLessThanOrEqual(30000)
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

    it('skips owners whose data is not expired when not forced', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/assets/', { expiresAt: Date.now() + 60000, etag: null }],
        ]),
        initialized: true,
      })

      await useAssetStore.getState().update(false)

      expect(esiClient.fetchWithPaginationMeta).not.toHaveBeenCalled()
    })

    it('fetches assets when data is expired', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')
      const { getCharacterAssetNames } = await import('@/api/endpoints/assets')
      const { fetchPrices, resolveTypes } = await import('@/api/ref-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test Character', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      const futureExpiry = Date.now() + 3600000
      vi.mocked(esiClient.fetchWithPaginationMeta).mockResolvedValue({
        data: [{ item_id: 1, type_id: 34, location_id: 60003760, location_type: 'station', location_flag: 'Hangar', quantity: 100, is_singleton: false }],
        expiresAt: futureExpiry,
        etag: '"abc123"',
        notModified: false,
      })
      vi.mocked(getCharacterAssetNames).mockResolvedValue([])
      vi.mocked(fetchPrices).mockResolvedValue(new Map([[34, 5]]))
      vi.mocked(resolveTypes).mockResolvedValue(new Map())

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/assets/', { expiresAt: Date.now() - 1000, etag: null }],
        ]),
        initialized: true,
      })

      await useAssetStore.getState().update(false)

      expect(esiClient.fetchWithPaginationMeta).toHaveBeenCalled()
      expect(useAssetStore.getState().assetsByOwner).toHaveLength(1)
      expect(useAssetStore.getState().isUpdating).toBe(false)

      const expiry = useExpiryCacheStore.getState().endpoints.get('character-12345:/characters/12345/assets/')
      expect(expiry?.expiresAt).toBe(futureExpiry)
      expect(expiry?.etag).toBe('"abc123"')
    })

    it('force=true bypasses expiry check', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')
      const { getCharacterAssetNames } = await import('@/api/endpoints/assets')
      const { fetchPrices, resolveTypes } = await import('@/api/ref-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esiClient.fetchWithPaginationMeta).mockResolvedValue({
        data: [],
        expiresAt: Date.now() + 3600000,
        etag: null,
        notModified: false,
      })
      vi.mocked(getCharacterAssetNames).mockResolvedValue([])
      vi.mocked(fetchPrices).mockResolvedValue(new Map())
      vi.mocked(resolveTypes).mockResolvedValue(new Map())

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/assets/', { expiresAt: Date.now() + 60000, etag: null }],
        ]),
        initialized: true,
      })

      await useAssetStore.getState().update(true)

      expect(esiClient.fetchWithPaginationMeta).toHaveBeenCalled()
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esiClient.fetchWithPaginationMeta).mockRejectedValue(new Error('API Error'))

      await useAssetStore.getState().update(true)

      expect(useAssetStore.getState().assetsByOwner).toHaveLength(0)
      expect(useAssetStore.getState().isUpdating).toBe(false)
    })
  })

  describe('removeForOwner', () => {
    it('clears expiry cache for removed owner', async () => {
      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      useAssetStore.setState({
        assetsByOwner: [{ owner: mockOwner, assets: [] }],
      })

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/assets/', { expiresAt: Date.now() + 60000, etag: null }],
        ]),
        initialized: true,
      })

      await useAssetStore.getState().removeForOwner('character', 12345)

      expect(useAssetStore.getState().assetsByOwner).toHaveLength(0)
      expect(useExpiryCacheStore.getState().endpoints.has('character-12345:/characters/12345/assets/')).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useAssetStore.setState({
        assetsByOwner: [{ owner: {} as never, assets: [] }],
        assetNames: new Map([[1, 'test']]),
        prices: new Map([[34, 5]]),
        updateError: 'some error',
      })

      await useAssetStore.getState().clear()

      const state = useAssetStore.getState()
      expect(state.assetsByOwner).toHaveLength(0)
      expect(state.assetNames.size).toBe(0)
      expect(state.prices.size).toBe(0)
      expect(state.updateError).toBeNull()
    })
  })
})
