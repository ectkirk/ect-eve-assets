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

const ABYSSAL_TYPE_IDS = new Set([
  56305, 47757, 47753, 47749, 56306, 47745, 47408, 47740, 52230, 49738, 52227,
  90483, 90498, 49734, 90593, 90529, 49730, 49726, 90524, 90502, 49722, 90460,
  90474, 90487, 90467, 56313, 47702, 90493, 78621, 47736, 47732, 56308, 56310,
  56307, 56312, 56311, 56309, 47832, 48427, 56304, 56303, 47846, 47838, 47820,
  47777, 48439, 84434, 84436, 84435, 84437, 47789, 47808, 47844, 47836, 47817,
  47773, 48435, 84438, 47828, 48423, 84440, 84439, 84441, 47785, 47804, 60482,
  60483, 47842, 47812, 47769, 48431, 84442, 47824, 48419, 84444, 84443, 84445,
  47781, 47800, 47840, 47793, 60480, 60478, 60479, 90622, 90621, 90618, 90614,
  60481,
])

vi.mock('@/store/price-store', () => ({
  usePriceStore: {
    getState: () => ({
      getAbyssalPrice: mockGetAbyssalPrice,
      setAbyssalPrices: mockSetAbyssalPrices,
    }),
  },
  isAbyssalTypeId: (typeId: number) => ABYSSAL_TYPE_IDS.has(typeId),
}))

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
    window.electronAPI = {
      mutamarketModule: mockMutamarketModule,
    } as unknown as typeof window.electronAPI
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

      mockMutamarketModule.mockResolvedValue({
        id: 12345,
        type: { id: 47408, name: 'Abyssal Damage Control' },
        source_type: { id: 2048, name: 'Damage Control II' },
        estimated_value: 2500000,
      })

      const result = await fetchAbyssalPrices([item(12345)])

      expect(mockMutamarketModule).toHaveBeenCalledWith(12345, 47408)
      expect(result.get(12345)).toBe(2500000)
      expect(mockSetAbyssalPrices).toHaveBeenCalled()
    })

    it('handles 404 responses by storing -1 price', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)

      mockMutamarketModule.mockResolvedValue({ error: 'HTTP 404', status: 404 })

      const result = await fetchAbyssalPrices([item(99999)])

      expect(result.has(99999)).toBe(false)
      expect(mockSetAbyssalPrices).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ itemId: 99999, price: -1 }),
        ])
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

      mockMutamarketModule.mockResolvedValue({ estimated_value: 1000000 })

      const onProgress = vi.fn()
      await fetchAbyssalPrices([item(1), item(2), item(3)], onProgress)

      expect(onProgress).toHaveBeenCalled()
    })

    it('processes items sequentially', async () => {
      mockGetAbyssalPrice.mockReturnValue(undefined)
      mockMutamarketModule.mockClear()

      mockMutamarketModule.mockResolvedValue({ estimated_value: 100 })

      const items = Array.from({ length: 3 }, (_, i) => item(i + 1))
      await fetchAbyssalPrices(items)

      expect(mockMutamarketModule).toHaveBeenCalledTimes(3)
    })

    it('re-fetches zero-priced items (from ref API) for manual sync', async () => {
      mockGetAbyssalPrice.mockReturnValue(0)

      mockMutamarketModule.mockResolvedValue({
        id: 12345,
        type: { id: 47408, name: 'Abyssal Damage Control' },
        source_type: { id: 2048, name: 'Damage Control II' },
        estimated_value: 5000000,
      })

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
        id: 12345,
        type: { id: 47408, name: 'Abyssal Damage Control' },
        source_type: { id: 2048, name: 'Damage Control II' },
      })

      const result = await fetchAbyssalPrices([item(12345)])

      expect(result.has(12345)).toBe(false)
      expect(mockSetAbyssalPrices).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ itemId: 12345, price: -1 }),
        ])
      )
    })
  })
})
