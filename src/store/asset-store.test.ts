import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useAssetStore } from './asset-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth-store')>()
  return {
    ...actual,
    useAuthStore: {
      getState: vi.fn(() => ({ owners: {} })),
    },
  }
})

vi.mock('@/api/esi', () => ({
  esi: {
    fetchPaginatedWithMeta: vi.fn(),
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
  resolveTypes: vi.fn(),
}))

vi.mock('./price-store', () => ({
  usePriceStore: {
    getState: () => ({
      ensureJitaPrices: vi.fn().mockResolvedValue(new Map()),
    }),
  },
}))

vi.mock('@/api/mutamarket-client', () => ({
  fetchAbyssalPrices: vi.fn(),
  isAbyssalTypeId: vi.fn(() => false),
}))

describe('asset-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAssetStore.setState({
      assetsByOwner: [],
      assetNames: new Map(),
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

  describe('update', () => {
    it('fetches assets when data is expired', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esi } = await import('@/api/esi')
      const { getCharacterAssetNames } = await import('@/api/endpoints/assets')
      const { resolveTypes } = await import('@/api/ref-client')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test Character',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-12345': mockOwner })
      )

      const futureExpiry = Date.now() + 3600000
      vi.mocked(esi.fetchPaginatedWithMeta).mockResolvedValue({
        data: [
          {
            item_id: 1,
            type_id: 34,
            location_id: 60003760,
            location_type: 'station',
            location_flag: 'Hangar',
            quantity: 100,
            is_singleton: false,
          },
        ],
        expiresAt: futureExpiry,
        etag: '"abc123"',
        notModified: false,
      })
      vi.mocked(getCharacterAssetNames).mockResolvedValue([])
      vi.mocked(resolveTypes).mockResolvedValue(new Map())

      useExpiryCacheStore.setState({
        endpoints: new Map([
          [
            'character-12345:/characters/12345/assets',
            { expiresAt: Date.now() - 1000, etag: null },
          ],
        ]),
        initialized: true,
      })

      await useAssetStore.getState().update(false)

      expect(esi.fetchPaginatedWithMeta).toHaveBeenCalled()
      expect(useAssetStore.getState().assetsByOwner).toHaveLength(1)
      expect(useAssetStore.getState().isUpdating).toBe(false)

      const expiry = useExpiryCacheStore
        .getState()
        .endpoints.get('character-12345:/characters/12345/assets')
      expect(expiry?.expiresAt).toBe(futureExpiry)
      expect(expiry?.etag).toBe('"abc123"')
    })
  })

  describe('removeForOwner', () => {
    it('clears expiry cache for removed owner', async () => {
      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      useAssetStore.setState({
        assetsByOwner: [{ owner: mockOwner, assets: [] }],
      })

      useExpiryCacheStore.setState({
        endpoints: new Map([
          [
            'character-12345:/characters/12345/assets',
            { expiresAt: Date.now() + 60000, etag: null },
          ],
        ]),
        initialized: true,
      })

      await useAssetStore.getState().removeForOwner('character', 12345)

      expect(useAssetStore.getState().assetsByOwner).toHaveLength(0)
      expect(
        useExpiryCacheStore
          .getState()
          .endpoints.has('character-12345:/characters/12345/assets')
      ).toBe(false)
    })
  })
})
