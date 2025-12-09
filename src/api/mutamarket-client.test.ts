import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isAbyssalTypeId,
  getCachedAbyssalPrice,
  hasCachedAbyssalPrice,
  fetchAbyssalPrices,
} from './mutamarket-client'

vi.mock('@/store/reference-cache', () => ({
  hasAbyssal: vi.fn(),
  getAbyssalPrice: vi.fn(),
  saveAbyssals: vi.fn(),
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
    it('delegates to getAbyssalPrice from reference-cache', async () => {
      const { getAbyssalPrice } = await import('@/store/reference-cache')
      vi.mocked(getAbyssalPrice).mockReturnValue(5000000)

      const result = getCachedAbyssalPrice(12345)

      expect(getAbyssalPrice).toHaveBeenCalledWith(12345)
      expect(result).toBe(5000000)
    })

    it('returns undefined when no cached price', async () => {
      const { getAbyssalPrice } = await import('@/store/reference-cache')
      vi.mocked(getAbyssalPrice).mockReturnValue(undefined)

      const result = getCachedAbyssalPrice(99999)

      expect(result).toBeUndefined()
    })
  })

  describe('hasCachedAbyssalPrice', () => {
    it('delegates to hasAbyssal from reference-cache', async () => {
      const { hasAbyssal } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(true)

      const result = hasCachedAbyssalPrice(12345)

      expect(hasAbyssal).toHaveBeenCalledWith(12345)
      expect(result).toBe(true)
    })
  })

  describe('fetchAbyssalPrices', () => {
    it('returns cached prices without fetching', async () => {
      const { hasAbyssal, getAbyssalPrice } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(true)
      vi.mocked(getAbyssalPrice).mockReturnValue(1000000)

      const result = await fetchAbyssalPrices([1, 2, 3])

      expect(mockMutamarketModule).not.toHaveBeenCalled()
      expect(result.size).toBe(3)
      expect(result.get(1)).toBe(1000000)
    })

    it('fetches uncached prices from Mutamarket API', async () => {
      const { hasAbyssal, saveAbyssals } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(false)

      mockMutamarketModule.mockResolvedValue({
        id: 12345,
        type: { id: 47408, name: 'Abyssal Damage Control' },
        source_type: { id: 2048, name: 'Damage Control II' },
        estimated_value: 2500000,
      })

      const result = await fetchAbyssalPrices([12345])

      expect(mockMutamarketModule).toHaveBeenCalledWith(12345)
      expect(result.get(12345)).toBe(2500000)
      expect(saveAbyssals).toHaveBeenCalled()
    })

    it('handles 404 responses by storing zero price', async () => {
      const { hasAbyssal, saveAbyssals } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(false)

      mockMutamarketModule.mockResolvedValue({ error: 'HTTP 404', status: 404 })

      const result = await fetchAbyssalPrices([99999])

      expect(result.has(99999)).toBe(false)
      expect(saveAbyssals).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 99999, price: 0 })])
      )
    })

    it('handles API errors gracefully', async () => {
      const { hasAbyssal } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(false)

      mockMutamarketModule.mockResolvedValue({ error: 'HTTP 500', status: 500 })

      const result = await fetchAbyssalPrices([12345])

      expect(result.size).toBe(0)
    })

    it('handles network errors gracefully', async () => {
      const { hasAbyssal } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(false)

      mockMutamarketModule.mockRejectedValue(new Error('Network error'))

      const result = await fetchAbyssalPrices([12345])

      expect(result.size).toBe(0)
    })

    it('calls onProgress callback', async () => {
      const { hasAbyssal } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(false)

      mockMutamarketModule.mockResolvedValue({ estimated_value: 1000000 })

      const onProgress = vi.fn()
      await fetchAbyssalPrices([1, 2, 3], onProgress)

      expect(onProgress).toHaveBeenCalled()
    })

    it('processes items sequentially', async () => {
      const { hasAbyssal } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(false)
      mockMutamarketModule.mockClear()

      mockMutamarketModule.mockResolvedValue({ estimated_value: 100 })

      const items = Array.from({ length: 3 }, (_, i) => i + 1)
      await fetchAbyssalPrices(items)

      expect(mockMutamarketModule).toHaveBeenCalledTimes(3)
    })

    it('skips zero-priced items in results but persists them', async () => {
      const { hasAbyssal, getAbyssalPrice } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(true)
      vi.mocked(getAbyssalPrice).mockReturnValue(0)

      const result = await fetchAbyssalPrices([12345])

      expect(result.has(12345)).toBe(false)
    })

    it('handles missing estimated_value in response', async () => {
      const { hasAbyssal, saveAbyssals } = await import('@/store/reference-cache')
      vi.mocked(hasAbyssal).mockReturnValue(false)

      mockMutamarketModule.mockResolvedValue({
        id: 12345,
        type: { id: 47408, name: 'Abyssal Damage Control' },
        source_type: { id: 2048, name: 'Damage Control II' },
      })

      const result = await fetchAbyssalPrices([12345])

      expect(result.has(12345)).toBe(false)
      expect(saveAbyssals).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 12345, price: 0 })])
      )
    })
  })
})
