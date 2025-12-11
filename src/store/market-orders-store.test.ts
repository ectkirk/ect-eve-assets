import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useMarketOrdersStore } from './market-orders-store'
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
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('market-orders-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMarketOrdersStore.setState({
      ordersByOwner: [],
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
    useExpiryCacheStore.setState({
      endpoints: new Map(),
      initialized: true,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useMarketOrdersStore.getState()
      expect(state.ordersByOwner).toEqual([])
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('update', () => {
    it('sets error when no owners logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useMarketOrdersStore.getState().update(true)

      expect(useMarketOrdersStore.getState().updateError).toBe('No owners logged in')
    })

    it('fetches orders when data is expired', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      const futureExpiry = Date.now() + 300000
      vi.mocked(esiClient.fetchWithPaginationMeta).mockResolvedValue({
        data: [
          {
            order_id: 1,
            type_id: 34,
            location_id: 60003760,
            price: 5,
            volume_remain: 100,
            volume_total: 100,
            is_buy_order: false,
            duration: 90,
            issued: '2024-01-01T00:00:00Z',
            range: 'station',
            region_id: 10000002,
            min_volume: 1,
            is_corporation: false,
          },
        ],
        expiresAt: futureExpiry,
        etag: '"abc123"',
        notModified: false,
      })

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/orders/', { expiresAt: Date.now() - 1000, etag: null }],
        ]),
        initialized: true,
      })

      await useMarketOrdersStore.getState().update(false)

      expect(esiClient.fetchWithPaginationMeta).toHaveBeenCalled()
      expect(useMarketOrdersStore.getState().ordersByOwner).toHaveLength(1)
      expect(useMarketOrdersStore.getState().ordersByOwner[0]?.orders).toHaveLength(1)

      const expiry = useExpiryCacheStore.getState().endpoints.get('character-12345:/characters/12345/orders/')
      expect(expiry?.expiresAt).toBe(futureExpiry)
    })

    it('skips owners whose data is not expired when not forced', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/orders/', { expiresAt: Date.now() + 60000, etag: null }],
        ]),
        initialized: true,
      })

      await useMarketOrdersStore.getState().update(false)

      expect(esiClient.fetchWithPaginationMeta).not.toHaveBeenCalled()
    })

    it('force=true bypasses expiry check', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esiClient.fetchWithPaginationMeta).mockResolvedValue({
        data: [],
        expiresAt: Date.now() + 300000,
        etag: null,
        notModified: false,
      })

      useExpiryCacheStore.setState({
        endpoints: new Map([
          ['character-12345:/characters/12345/orders/', { expiresAt: Date.now() + 60000, etag: null }],
        ]),
        initialized: true,
      })

      await useMarketOrdersStore.getState().update(true)

      expect(esiClient.fetchWithPaginationMeta).toHaveBeenCalled()
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { esiClient } = await import('@/api/esi-client')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(esiClient.fetchWithPaginationMeta).mockRejectedValue(new Error('API Error'))

      await useMarketOrdersStore.getState().update(true)

      expect(useMarketOrdersStore.getState().ordersByOwner).toHaveLength(0)
      expect(useMarketOrdersStore.getState().isUpdating).toBe(false)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useMarketOrdersStore.setState({
        ordersByOwner: [{ owner: {} as never, orders: [] }],
        updateError: 'some error',
      })

      await useMarketOrdersStore.getState().clear()

      const state = useMarketOrdersStore.getState()
      expect(state.ordersByOwner).toHaveLength(0)
      expect(state.updateError).toBeNull()
    })
  })
})
