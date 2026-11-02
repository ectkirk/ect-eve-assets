import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isAbyssalTypeId,
  getCachedAbyssalPrice,
  getValidAbyssalPrice,
  fetchAbyssalPrices,
  type AbyssalItem,
} from './mutamarket-client'

const mockGetAbyssalPrice = vi.fn()
const mockSetAbyssalPrices = vi.fn()

vi.mock('@/store/price-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/price-store')>()
  return {
    ...actual,
    usePriceStore: {
      getState: () => ({
        getAbyssalPrice: mockGetAbyssalPrice,
        setAbyssalPrices: mockSetAbyssalPrices,
      }),
    },
  }
})

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const mockMutamarketModule = vi.fn()

const item = (itemId: number, typeId = 47408): AbyssalItem => ({
  itemId,
  typeId,
})

describe('mutamarket-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        mutamarketModule: mockMutamarketModule,
      } as unknown as typeof window.electronAPI,
    })
  })

  describe('isAbyssalTypeId', () => {
    it('returns true for known abyssal type IDs', () => {
      expect(isAbyssalTypeId(47757)).toBe(true)
      expect(isAbyssalTypeId(56305)).toBe(true)
      expect(isAbyssalTypeId(47408)).toBe(true)
    })

    it('returns false for non-abyssal type IDs', () => {
      expect(isAbyssalTypeId(34)).toBe(false)
      expect(isAbyssalTypeId(587)).toBe(false)
      expect(isAbyssalTypeId(0)).toBe(false)
    })
  })

  describe('getCachedAbyssalPrice', () => {
    it('delegates to getAbyssalPrice from price-store', () => {
      mockGetAbyssalPrice.mockReturnValue(5000000)

      const result = getCachedAbyssalPrice(12345)

      expect(mockGetAbyssalPrice).toHaveBeenCalledWith(12345)
      expect(result).toBe(5000000)
    })

    it('returns undefined when no cached price', () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      const result = getCachedAbyssalPrice(99999)

      expect(result).toBeUndefined()
    })
  })

  describe('getValidAbyssalPrice', () => {
    it('returns price when positive', () => {
      mockGetAbyssalPrice.mockReturnValue(5000000)

      const result = getValidAbyssalPrice(12345)

      expect(result).toBe(5000000)
    })

    it('returns undefined for zero price', () => {
      mockGetAbyssalPrice.mockReturnValue(0)

      const result = getValidAbyssalPrice(12345)

      expect(result).toBeUndefined()
    })

    it('returns undefined for -1 (manually synced not found)', () => {
      mockGetAbyssalPrice.mockReturnValue(-1)

      const result = getValidAbyssalPrice(12345)

      expect(result).toBeUndefined()
    })

    it('returns undefined when no cached price', () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      const result = getValidAbyssalPrice(12345)

      expect(result).toBeUndefined()
    })
  })

  // Shape of GET/POST https://mutamarket.com/api/modules (ModuleEnvelope),
  // including the nullable fields that are not used for pricing.
  function moduleResponse(id: number, estimatedValue: number | null) {
    return {
      data: {
        id,
        slug: `abyssal-module-${id}`,
        type: { id: 47408, name: 'Abyssal Damage Control' },
        source_type: null,
        mutaplasmid: null,
        mutated_attributes: [],
        contract: {
          id: 1,
          type: 'auction',
          price: null,
          asking_for_items: false,
          plex_count: 0,
          non_abyssal_modules_count: 0,
          abyssal_modules_count: 1,
        },
        estimated_value: estimatedValue,
        estimated_value_updated_at: null,
      },
    }
  }

  describe('fetchAbyssalPrices', () => {
    it('returns cached prices without fetching', async () => {
      mockGetAbyssalPrice.mockReturnValue(1000000)

      const result = await fetchAbyssalPrices([item(1), item(2), item(3)])

      expect(mockMutamarketModule).not.toHaveBeenCalled()
      expect(result.size).toBe(3)
      expect(result.get(1)).toBe(1000000)
    })

    it('fetches uncached prices from Mutamarket API', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      mockMutamarketModule.mockResolvedValue(moduleResponse(12345, 2500000))

      const result = await fetchAbyssalPrices([item(12345)])

      expect(mockMutamarketModule).toHaveBeenCalledWith(12345, 47408)
      expect(result.get(12345)).toBe(2500000)
      expect(mockSetAbyssalPrices).toHaveBeenCalled()
    })

    it('reads the price from the API envelope despite nullable extra fields', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)
      mockMutamarketModule.mockResolvedValue(moduleResponse(777, 42000000))

      const result = await fetchAbyssalPrices([item(777)])

      expect(result.get(777)).toBe(42000000)
      expect(mockSetAbyssalPrices).toHaveBeenCalledWith([
        { itemId: 777, price: 42000000 },
      ])
    })

    it('stores -1 when Mutamarket has no estimate yet', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)
      mockMutamarketModule.mockResolvedValue(moduleResponse(778, null))

      const result = await fetchAbyssalPrices([item(778)])

      expect(result.has(778)).toBe(false)
      expect(mockSetAbyssalPrices).toHaveBeenCalledWith([
        { itemId: 778, price: -1 },
      ])
    })

    it('handles 404 responses by storing -1 price', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      mockMutamarketModule.mockResolvedValue({ error: 'HTTP 404', status: 404 })

      const result = await fetchAbyssalPrices([item(99999)])

      expect(result.has(99999)).toBe(false)
      expect(mockSetAbyssalPrices).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ itemId: 99999, price: -1 }),
        ]),
      )
    })

    it('handles API errors gracefully', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      mockMutamarketModule.mockResolvedValue({ error: 'HTTP 500', status: 500 })

      const result = await fetchAbyssalPrices([item(12345)])

      expect(result.size).toBe(0)
    })

    it('handles network errors gracefully', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      mockMutamarketModule.mockRejectedValue(new Error('Network error'))

      const result = await fetchAbyssalPrices([item(12345)])

      expect(result.size).toBe(0)
    })

    it('calls onProgress callback', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      mockMutamarketModule.mockResolvedValue(moduleResponse(1, 1000000))

      const onProgress = vi.fn()
      await fetchAbyssalPrices([item(1), item(2), item(3)], onProgress)

      expect(onProgress).toHaveBeenCalled()
    })

    it('processes items sequentially', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)
      mockMutamarketModule.mockClear()

      mockMutamarketModule.mockResolvedValue(moduleResponse(1, 100))

      const items = Array.from({ length: 3 }, (_, i) => item(i + 1))
      await fetchAbyssalPrices(items)

      expect(mockMutamarketModule).toHaveBeenCalledTimes(3)
    })

    it('re-fetches zero-priced items (from ref API) for manual sync', async () => {
      mockGetAbyssalPrice.mockReturnValue(0)

      mockMutamarketModule.mockResolvedValue(moduleResponse(12345, 5000000))

      const result = await fetchAbyssalPrices([item(12345)])

      expect(mockMutamarketModule).toHaveBeenCalledWith(12345, 47408)
      expect(result.get(12345)).toBe(5000000)
    })

    it('skips -1 priced items (already manually synced)', async () => {
      mockGetAbyssalPrice.mockReturnValue(-1)

      const result = await fetchAbyssalPrices([item(12345)])

      expect(mockMutamarketModule).not.toHaveBeenCalled()
      expect(result.has(12345)).toBe(false)
    })

    it('handles missing estimated_value in response', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      mockMutamarketModule.mockResolvedValue({
        data: {
          id: 12345,
          type: { id: 47408, name: 'Abyssal Damage Control' },
        },
      })

      const result = await fetchAbyssalPrices([item(12345)])

      expect(result.has(12345)).toBe(false)
      expect(mockSetAbyssalPrices).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ itemId: 12345, price: -1 }),
        ]),
      )
    })

    it('treats a zero estimate as no price', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      mockMutamarketModule.mockResolvedValue(moduleResponse(12345, 0))

      const result = await fetchAbyssalPrices([item(12345)])

      expect(result.has(12345)).toBe(false)
      expect(mockSetAbyssalPrices).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ itemId: 12345, price: -1 }),
        ]),
      )
    })
  })
})
