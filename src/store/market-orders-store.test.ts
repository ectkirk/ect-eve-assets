import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useMarketOrdersStore } from './market-orders-store'
import { createMockOwner, createMockAuthState } from '@/test/helpers'

vi.mock('./auth-store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ owners: {} })),
  },
}))

vi.mock('@/api/endpoints/market', () => ({
  getCharacterOrders: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

describe('market-orders-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMarketOrdersStore.setState({
      ordersByOwner: [],
      lastUpdated: null,
      isUpdating: false,
      updateError: null,
      initialized: false,
    })
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useMarketOrdersStore.getState()
      expect(state.ordersByOwner).toEqual([])
      expect(state.lastUpdated).toBeNull()
      expect(state.isUpdating).toBe(false)
      expect(state.updateError).toBeNull()
      expect(state.initialized).toBe(false)
    })
  })

  describe('canUpdate', () => {
    it('returns true when never updated', () => {
      useMarketOrdersStore.setState({ lastUpdated: null, isUpdating: false })
      expect(useMarketOrdersStore.getState().canUpdate()).toBe(true)
    })

    it('returns false when currently updating', () => {
      useMarketOrdersStore.setState({ isUpdating: true })
      expect(useMarketOrdersStore.getState().canUpdate()).toBe(false)
    })

    it('returns false when updated recently', () => {
      useMarketOrdersStore.setState({ lastUpdated: Date.now(), isUpdating: false })
      expect(useMarketOrdersStore.getState().canUpdate()).toBe(false)
    })

    it('returns true when cooldown has passed (5 min)', () => {
      useMarketOrdersStore.setState({ lastUpdated: Date.now() - 6 * 60 * 1000, isUpdating: false })
      expect(useMarketOrdersStore.getState().canUpdate()).toBe(true)
    })
  })

  describe('getTimeUntilUpdate', () => {
    it('returns 0 when never updated', () => {
      useMarketOrdersStore.setState({ lastUpdated: null })
      expect(useMarketOrdersStore.getState().getTimeUntilUpdate()).toBe(0)
    })

    it('returns remaining time when in cooldown', () => {
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000
      useMarketOrdersStore.setState({ lastUpdated: twoMinutesAgo })
      const remaining = useMarketOrdersStore.getState().getTimeUntilUpdate()
      expect(remaining).toBeGreaterThan(2 * 60 * 1000)
      expect(remaining).toBeLessThanOrEqual(3 * 60 * 1000)
    })
  })

  describe('update', () => {
    it('sets error when no characters logged in', async () => {
      const { useAuthStore } = await import('./auth-store')
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({}))

      await useMarketOrdersStore.getState().update(true)

      expect(useMarketOrdersStore.getState().updateError).toBe('No characters logged in')
    })

    it('only fetches for character owners, not corporations', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterOrders } = await import('@/api/endpoints/market')

      const charOwner = createMockOwner({ id: 12345, name: 'Test Character', type: 'character' })
      const corpOwner = createMockOwner({ id: 98000001, characterId: 12345, name: 'Test Corp', type: 'corporation' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({
        'character-12345': charOwner,
        'corporation-98000001': corpOwner,
      }))

      vi.mocked(getCharacterOrders).mockResolvedValue([])

      await useMarketOrdersStore.getState().update(true)

      expect(getCharacterOrders).toHaveBeenCalledTimes(1)
      expect(getCharacterOrders).toHaveBeenCalledWith(12345)
    })

    it('fetches orders successfully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterOrders } = await import('@/api/endpoints/market')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterOrders).mockResolvedValue([
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
      ])

      await useMarketOrdersStore.getState().update(true)

      expect(useMarketOrdersStore.getState().ordersByOwner).toHaveLength(1)
      expect(useMarketOrdersStore.getState().ordersByOwner[0]?.orders).toHaveLength(1)
    })

    it('handles fetch errors gracefully', async () => {
      const { useAuthStore } = await import('./auth-store')
      const { getCharacterOrders } = await import('@/api/endpoints/market')

      const mockOwner = createMockOwner({ id: 12345, name: 'Test', type: 'character' })
      vi.mocked(useAuthStore.getState).mockReturnValue(createMockAuthState({ 'character-12345': mockOwner }))

      vi.mocked(getCharacterOrders).mockRejectedValue(new Error('API Error'))

      await useMarketOrdersStore.getState().update(true)

      expect(useMarketOrdersStore.getState().ordersByOwner).toHaveLength(0)
      expect(useMarketOrdersStore.getState().isUpdating).toBe(false)
    })

    it('shows cooldown message when not forced', async () => {
      useMarketOrdersStore.setState({ lastUpdated: Date.now() })

      await useMarketOrdersStore.getState().update(false)

      expect(useMarketOrdersStore.getState().updateError).toMatch(/Update available in/)
    })
  })

  describe('clear', () => {
    it('resets store state', async () => {
      useMarketOrdersStore.setState({
        ordersByOwner: [{ owner: {} as never, orders: [] }],
        lastUpdated: Date.now(),
        updateError: 'some error',
      })

      await useMarketOrdersStore.getState().clear()

      const state = useMarketOrdersStore.getState()
      expect(state.ordersByOwner).toHaveLength(0)
      expect(state.lastUpdated).toBeNull()
      expect(state.updateError).toBeNull()
    })
  })
})
