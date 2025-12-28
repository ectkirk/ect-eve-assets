import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useMarketOrdersStore } from './market-orders-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
  ownerKey: (type: string, id: number) => `${type}-${id}`,
  findOwnerByKey: vi.fn(),
}))

vi.mock('@/api/esi', () => ({
  esi: {
    fetchPaginatedWithMeta: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/data-resolver', () => ({
  triggerResolution: vi.fn(),
}))

vi.mock('./regional-market-store', () => ({
  useRegionalMarketStore: {
    getState: vi.fn(() => ({
      getPrice: vi.fn((typeId: number) => (typeId === 34 ? 10 : undefined)),
      fetchPricesForTypes: vi.fn(),
      registerTypes: vi.fn(),
      registerStructures: vi.fn(),
      untrackTypes: vi.fn(),
      untrackStructures: vi.fn(),
    })),
  },
}))

vi.mock('./price-store', () => ({
  usePriceStore: {
    getState: vi.fn(() => ({
      getItemPrice: vi.fn((typeId: number) => (typeId === 34 ? 10 : 0)),
    })),
  },
}))

describe('market-orders-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMarketOrdersStore.setState({
      itemsById: new Map(),
      visibilityByOwner: new Map(),
      isUpdating: false,
      updateError: null,
      initialized: true,
    })
    useExpiryCacheStore.setState({
      endpoints: new Map(),
      initialized: true,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useMarketOrdersStore.getState()
      expect(state.itemsById.size).toBe(0)
      expect(state.visibilityByOwner.size).toBe(0)
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(true)
    })
  })

  describe('update', () => {
    it('sets error when no owners logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useMarketOrdersStore.getState().update(true)

      expect(useMarketOrdersStore.getState().updateError).toBe(
        'No owners logged in'
      )
    })

    it('fetches orders when data is expired', async () => {
      const { useAuthStore, findOwnerByKey } = await import('./auth-store')
      const { esi } = await import('@/api/esi')

      const mockOwner = createMockOwner({
        id: 12345,
        name: 'Test',
        type: 'character',
      })
      vi.mocked(useAuthStore.getState).mockReturnValue(
        createMockAuthState({ 'character-12345': mockOwner })
      )
      vi.mocked(findOwnerByKey).mockReturnValue(mockOwner)

      const futureExpiry = Date.now() + 300000
      vi.mocked(esi.fetchPaginatedWithMeta).mockResolvedValue({
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
          [
            'character-12345:/characters/12345/orders',
            { expiresAt: Date.now() - 1000, etag: null },
          ],
        ]),
        initialized: true,
      })

      await useMarketOrdersStore.getState().update(false)

      expect(esi.fetchPaginatedWithMeta).toHaveBeenCalled()

      const state = useMarketOrdersStore.getState()
      expect(state.itemsById.size).toBe(1)
      expect(state.visibilityByOwner.get('character-12345')?.size).toBe(1)

      const ordersByOwner = useMarketOrdersStore.getOrdersByOwner()
      expect(ordersByOwner).toHaveLength(1)
      expect(ordersByOwner[0]?.orders).toHaveLength(1)

      const expiry = useExpiryCacheStore
        .getState()
        .endpoints.get('character-12345:/characters/12345/orders')
      expect(expiry?.expiresAt).toBeGreaterThanOrEqual(futureExpiry - 1000)
    })

    it('skips owners whose data is not expired when not forced', async () => {
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

      useExpiryCacheStore.setState({
        endpoints: new Map([
          [
            'character-12345:/characters/12345/orders',
            { expiresAt: Date.now() + 60000, etag: null },
          ],
        ]),
        initialized: true,
      })

      await useMarketOrdersStore.getState().update(false)

      expect(esi.fetchPaginatedWithMeta).not.toHaveBeenCalled()
    })

    it('force=true bypasses expiry check', async () => {
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

      vi.mocked(esi.fetchPaginatedWithMeta).mockResolvedValue({
        data: [],
        expiresAt: Date.now() + 300000,
        etag: null,
        notModified: false,
      })

      useExpiryCacheStore.setState({
        endpoints: new Map([
          [
            'character-12345:/characters/12345/orders',
            { expiresAt: Date.now() + 60000, etag: null },
          ],
        ]),
        initialized: true,
      })

      await useMarketOrdersStore.getState().update(true)

      expect(esi.fetchPaginatedWithMeta).toHaveBeenCalled()
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

      vi.mocked(esi.fetchPaginatedWithMeta).mockRejectedValue(
        new Error('API Error')
      )

      await useMarketOrdersStore.getState().update(true)

      expect(useMarketOrdersStore.getState().itemsById.size).toBe(0)
      expect(useMarketOrdersStore.getState().isUpdating).toBe(false)
    })
  })

  describe('getTotal', () => {
    it('calculates sell order total using prices', () => {
      useMarketOrdersStore.setState({
        itemsById: new Map([
          [
            1,
            {
              item: {
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
              sourceOwner: {
                type: 'character' as const,
                id: 12345,
                characterId: 12345,
              },
            },
          ],
        ]),
        visibilityByOwner: new Map([['character-12345', new Set([1])]]),
        initialized: true,
      })

      const total = useMarketOrdersStore.getTotal(['character-12345'])
      expect(total).toBe(1000) // 10 * 100
    })

    it('calculates buy order total using escrow', () => {
      useMarketOrdersStore.setState({
        itemsById: new Map([
          [
            1,
            {
              item: {
                order_id: 1,
                type_id: 34,
                location_id: 60003760,
                price: 5,
                volume_remain: 100,
                volume_total: 100,
                is_buy_order: true,
                escrow: 500,
                duration: 90,
                issued: '2024-01-01T00:00:00Z',
                range: 'station',
                region_id: 10000002,
                min_volume: 1,
                is_corporation: false,
              },
              sourceOwner: {
                type: 'character' as const,
                id: 12345,
                characterId: 12345,
              },
            },
          ],
        ]),
        visibilityByOwner: new Map([['character-12345', new Set([1])]]),
        initialized: true,
      })

      const total = useMarketOrdersStore.getTotal(['character-12345'])
      expect(total).toBe(500)
    })

    it('only includes orders for selected owners', () => {
      useMarketOrdersStore.setState({
        itemsById: new Map([
          [
            1,
            {
              item: {
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
              sourceOwner: {
                type: 'character' as const,
                id: 12345,
                characterId: 12345,
              },
            },
          ],
          [
            2,
            {
              item: {
                order_id: 2,
                type_id: 34,
                location_id: 60003760,
                price: 5,
                volume_remain: 50,
                volume_total: 50,
                is_buy_order: false,
                duration: 90,
                issued: '2024-01-01T00:00:00Z',
                range: 'station',
                region_id: 10000002,
                min_volume: 1,
                is_corporation: false,
              },
              sourceOwner: {
                type: 'character' as const,
                id: 67890,
                characterId: 67890,
              },
            },
          ],
        ]),
        visibilityByOwner: new Map([
          ['character-12345', new Set([1])],
          ['character-67890', new Set([2])],
        ]),
        initialized: true,
      })

      const total = useMarketOrdersStore.getTotal(['character-12345'])
      expect(total).toBe(1000) // Only first owner's order
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useMarketOrdersStore.setState({
        itemsById: new Map([
          [1, { item: {} as never, sourceOwner: {} as never }],
        ]),
        visibilityByOwner: new Map([['character-12345', new Set([1])]]),
        updateError: 'some error',
      })

      await useMarketOrdersStore.getState().clear()

      const state = useMarketOrdersStore.getState()
      expect(state.itemsById.size).toBe(0)
      expect(state.visibilityByOwner.size).toBe(0)
      expect(state.updateError).toBeNull()
    })
  })
})
