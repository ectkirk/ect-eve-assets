import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  usePriceStore,
  getJitaPrice,
  getEsiAveragePrice,
  getEsiAdjustedPrice,
} from './price-store'

vi.mock('./reference-cache', () => ({
  getTypeBasePrice: vi.fn((typeId: number) =>
    typeId === 11399 ? 1000000 : undefined
  ),
  isTypeBlueprint: vi.fn((typeId: number) => typeId === 11399),
}))

vi.mock('./price-refresh-timers', () => ({
  scheduleEsiRefresh: vi.fn(),
  startJitaRefreshTimer: vi.fn(),
  stopPriceRefreshTimers: vi.fn(),
}))

vi.mock('./price-refresh-schedule', () => ({
  shouldRefreshEsi: vi.fn(() => false),
  shouldRefreshJita: vi.fn(() => false),
}))

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('./store-registry', () => ({
  useStoreRegistry: {
    getState: () => ({ register: vi.fn() }),
  },
}))

describe('price-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePriceStore.setState({
      jitaPrices: new Map(),
      esiPrices: new Map(),
      abyssalPrices: new Map(),
      marketPrices: new Map(),
      isUpdatingJita: false,
      isUpdatingEsi: false,
      initialized: true,
      priceVersion: 0,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = usePriceStore.getState()
      expect(state.jitaPrices.size).toBe(0)
      expect(state.esiPrices.size).toBe(0)
      expect(state.abyssalPrices.size).toBe(0)
      expect(state.marketPrices.size).toBe(0)
      expect(state.isUpdatingJita).toBe(false)
      expect(state.isUpdatingEsi).toBe(false)
    })
  })

  describe('getItemPrice', () => {
    it('returns 0 for blueprint copies', () => {
      const price = usePriceStore
        .getState()
        .getItemPrice(34, { isBlueprintCopy: true })
      expect(price).toBe(0)
    })

    it('returns base price for blueprints', () => {
      const price = usePriceStore.getState().getItemPrice(11399)
      expect(price).toBe(1000000)
    })

    it('returns jita price for regular items', () => {
      usePriceStore.setState({
        jitaPrices: new Map([[34, 10.5]]),
        initialized: true,
      })

      const price = usePriceStore.getState().getItemPrice(34)
      expect(price).toBe(10.5)
    })

    it('returns 0 when no price available', () => {
      const price = usePriceStore.getState().getItemPrice(99999)
      expect(price).toBe(0)
    })

    it('returns abyssal price when itemId provided and type is abyssal', () => {
      usePriceStore.setState({
        abyssalPrices: new Map([[12345, 500000000]]),
        initialized: true,
      })

      const price = usePriceStore
        .getState()
        .getItemPrice(47757, { itemId: 12345 })
      expect(price).toBe(500000000)
    })

    it('falls back to jita price when abyssal price not available', () => {
      usePriceStore.setState({
        jitaPrices: new Map([[47757, 1000000]]),
        abyssalPrices: new Map(),
        initialized: true,
      })

      const price = usePriceStore
        .getState()
        .getItemPrice(47757, { itemId: 99999 })
      expect(price).toBe(1000000)
    })

    it('prefers market price over jita price', () => {
      usePriceStore.setState({
        jitaPrices: new Map([[34, 10]]),
        marketPrices: new Map([[34, 15]]),
        initialized: true,
      })

      const price = usePriceStore.getState().getItemPrice(34)
      expect(price).toBe(15)
    })
  })

  describe('getAbyssalPrice', () => {
    it('returns price when available', () => {
      usePriceStore.setState({
        abyssalPrices: new Map([[12345, 500000000]]),
        initialized: true,
      })

      const price = usePriceStore.getState().getAbyssalPrice(12345)
      expect(price).toBe(500000000)
    })

    it('returns undefined when not available', () => {
      const price = usePriceStore.getState().getAbyssalPrice(99999)
      expect(price).toBeUndefined()
    })
  })

  describe('hasAbyssalPrice', () => {
    it('returns true when price exists', () => {
      usePriceStore.setState({
        abyssalPrices: new Map([[12345, 500000000]]),
        initialized: true,
      })

      expect(usePriceStore.getState().hasAbyssalPrice(12345)).toBe(true)
    })

    it('returns false when price does not exist', () => {
      expect(usePriceStore.getState().hasAbyssalPrice(99999)).toBe(false)
    })
  })

  describe('setAbyssalPrices', () => {
    it('merges new prices with existing', async () => {
      usePriceStore.setState({
        abyssalPrices: new Map([[11111, 100]]),
        initialized: true,
      })

      await usePriceStore.getState().setAbyssalPrices([
        { itemId: 22222, price: 200 },
        { itemId: 33333, price: 300 },
      ])

      const state = usePriceStore.getState()
      expect(state.abyssalPrices.get(11111)).toBe(100)
      expect(state.abyssalPrices.get(22222)).toBe(200)
      expect(state.abyssalPrices.get(33333)).toBe(300)
    })

    it('does nothing when prices array is empty', async () => {
      const initialAbyssal = new Map([[11111, 100]])
      usePriceStore.setState({
        abyssalPrices: initialAbyssal,
        initialized: true,
      })

      await usePriceStore.getState().setAbyssalPrices([])

      expect(usePriceStore.getState().abyssalPrices).toBe(initialAbyssal)
    })
  })

  describe('setMarketPrices', () => {
    it('sets market prices and increments version', () => {
      usePriceStore.setState({ priceVersion: 5, initialized: true })

      const newPrices = new Map([
        [34, 15],
        [35, 20],
      ])
      usePriceStore.getState().setMarketPrices(newPrices)

      const state = usePriceStore.getState()
      expect(state.marketPrices.get(34)).toBe(15)
      expect(state.marketPrices.get(35)).toBe(20)
      expect(state.priceVersion).toBe(6)
    })
  })

  describe('pruneAbyssalPrices', () => {
    it('removes prices for items no longer owned', async () => {
      usePriceStore.setState({
        abyssalPrices: new Map([
          [11111, 100],
          [22222, 200],
          [33333, 300],
        ]),
        initialized: true,
      })

      await usePriceStore.getState().pruneAbyssalPrices(new Set([11111, 33333]))

      const state = usePriceStore.getState()
      expect(state.abyssalPrices.has(11111)).toBe(true)
      expect(state.abyssalPrices.has(22222)).toBe(false)
      expect(state.abyssalPrices.has(33333)).toBe(true)
    })

    it('does nothing when all items are still owned', async () => {
      usePriceStore.setState({
        abyssalPrices: new Map([
          [11111, 100],
          [22222, 200],
        ]),
        initialized: true,
      })

      await usePriceStore.getState().pruneAbyssalPrices(new Set([11111, 22222]))

      const state = usePriceStore.getState()
      expect(state.abyssalPrices.size).toBe(2)
    })
  })

  describe('clear methods', () => {
    it('clearAbyssal clears abyssal prices', async () => {
      usePriceStore.setState({
        abyssalPrices: new Map([[11111, 100]]),
        initialized: true,
      })

      await usePriceStore.getState().clearAbyssal()

      expect(usePriceStore.getState().abyssalPrices.size).toBe(0)
    })

    it('clearJita clears jita and market prices', async () => {
      usePriceStore.setState({
        jitaPrices: new Map([[34, 10]]),
        marketPrices: new Map([[34, 15]]),
        initialized: true,
      })

      await usePriceStore.getState().clearJita()

      const state = usePriceStore.getState()
      expect(state.jitaPrices.size).toBe(0)
      expect(state.marketPrices.size).toBe(0)
      expect(state.initialized).toBe(false)
    })

    it('clearEsi clears ESI prices and increments version', async () => {
      usePriceStore.setState({
        esiPrices: new Map([[34, { average: 10, adjusted: 9 }]]),
        priceVersion: 5,
        initialized: true,
      })

      await usePriceStore.getState().clearEsi()

      const state = usePriceStore.getState()
      expect(state.esiPrices.size).toBe(0)
      expect(state.priceVersion).toBe(6)
    })

    it('clear clears all prices', async () => {
      usePriceStore.setState({
        jitaPrices: new Map([[34, 10]]),
        esiPrices: new Map([[34, { average: 10 }]]),
        abyssalPrices: new Map([[11111, 100]]),
        marketPrices: new Map([[34, 15]]),
        priceVersion: 5,
        initialized: true,
      })

      await usePriceStore.getState().clear()

      const state = usePriceStore.getState()
      expect(state.jitaPrices.size).toBe(0)
      expect(state.esiPrices.size).toBe(0)
      expect(state.abyssalPrices.size).toBe(0)
      expect(state.marketPrices.size).toBe(0)
      expect(state.priceVersion).toBe(0)
      expect(state.initialized).toBe(false)
    })
  })

  describe('helper functions', () => {
    it('getJitaPrice returns price from store', () => {
      usePriceStore.setState({
        jitaPrices: new Map([[34, 10.5]]),
        initialized: true,
      })

      expect(getJitaPrice(34)).toBe(10.5)
      expect(getJitaPrice(99999)).toBeUndefined()
    })

    it('getEsiAveragePrice returns average price', () => {
      usePriceStore.setState({
        esiPrices: new Map([[34, { average: 10.5, adjusted: 9.5 }]]),
        initialized: true,
      })

      expect(getEsiAveragePrice(34)).toBe(10.5)
      expect(getEsiAveragePrice(99999)).toBeUndefined()
    })

    it('getEsiAdjustedPrice returns adjusted price', () => {
      usePriceStore.setState({
        esiPrices: new Map([[34, { average: 10.5, adjusted: 9.5 }]]),
        initialized: true,
      })

      expect(getEsiAdjustedPrice(34)).toBe(9.5)
      expect(getEsiAdjustedPrice(99999)).toBeUndefined()
    })
  })
})
