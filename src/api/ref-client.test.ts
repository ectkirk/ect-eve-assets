import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveTypes, resolveLocations, fetchPrices, _resetForTests } from './ref-client'

vi.mock('@/store/reference-cache', () => ({
  getType: vi.fn(),
  saveTypes: vi.fn(),
  hasLocation: vi.fn(),
  getLocation: vi.fn(),
  saveLocations: vi.fn(),
  getGroup: vi.fn(),
  getCategory: vi.fn(),
  setCategories: vi.fn(),
  setGroups: vi.fn(),
  isReferenceDataLoaded: vi.fn(() => true),
}))

import { getType, saveTypes, hasLocation, getLocation, saveLocations, getGroup, getCategory } from '@/store/reference-cache'

const mockRefTypes = vi.fn()
const mockRefUniverse = vi.fn()
const mockRefMarket = vi.fn()
const mockRefMarketJita = vi.fn()
const mockRefCategories = vi.fn()
const mockRefGroups = vi.fn()

async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(2100)
  return promise
}

describe('ref-client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    _resetForTests()

    vi.mocked(getGroup).mockImplementation((id) => {
      if (id === 18) return { id: 18, name: 'Mineral', categoryId: 4 }
      return undefined
    })
    vi.mocked(getCategory).mockImplementation((id) => {
      if (id === 4) return { id: 4, name: 'Material' }
      return undefined
    })

    mockRefCategories.mockResolvedValue({ items: { '4': { id: 4, name: 'Material' } } })
    mockRefGroups.mockResolvedValue({ items: { '18': { id: 18, name: 'Mineral', categoryId: 4 } } })

    window.electronAPI = {
      refTypes: mockRefTypes,
      refUniverse: mockRefUniverse,
      refMarket: mockRefMarket,
      refMarketJita: mockRefMarketJita,
      refCategories: mockRefCategories,
      refGroups: mockRefGroups,
    } as unknown as typeof window.electronAPI
  })

  describe('resolveTypes', () => {
    it('returns empty map for empty input', async () => {
      const result = await runWithTimers(resolveTypes([]))
      expect(result.size).toBe(0)
    })

    it('uses cached types when available', async () => {
      vi.mocked(getType).mockImplementation((id) => {
        if (id === 34) {
          return {
            id: 34,
            name: 'Tritanium',
            groupId: 18,
            groupName: 'Mineral',
            categoryId: 4,
            categoryName: 'Material',
            volume: 0.01,
          }
        }
        return undefined
      })

      const result = await runWithTimers(resolveTypes([34]))

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Tritanium')
      expect(mockRefTypes).not.toHaveBeenCalled()
    })

    it('fetches uncached types from API', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      mockRefTypes.mockResolvedValueOnce({
        items: {
          '34': {
            id: 34,
            name: 'Tritanium',
            groupId: 18,
            volume: 0.01,
          },
        },
      })

      const result = await runWithTimers(resolveTypes([34]))

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Tritanium')
      expect(result.get(34)?.groupName).toBe('Mineral')
      expect(result.get(34)?.categoryName).toBe('Material')
      expect(saveTypes).toHaveBeenCalled()
    })

    it('creates placeholder for types not returned by API', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      mockRefTypes.mockResolvedValueOnce({ items: {} })

      const result = await runWithTimers(resolveTypes([99999]))

      expect(result.size).toBe(1)
      expect(result.get(99999)?.name).toBe('Unknown Type 99999')
      expect(saveTypes).toHaveBeenCalled()
    })

    it('skips already cached Unknown Types', async () => {
      vi.mocked(getType).mockImplementation((id) => {
        if (id === 99999) {
          return {
            id: 99999,
            name: 'Unknown Type 99999',
            groupId: 0,
            groupName: '',
            categoryId: 0,
            categoryName: '',
            volume: 0,
          }
        }
        return undefined
      })

      const result = await runWithTimers(resolveTypes([99999]))

      expect(mockRefTypes).not.toHaveBeenCalled()
      expect(result.get(99999)?.name).toBe('Unknown Type 99999')
    })

    it('handles API errors gracefully and creates placeholder', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      mockRefTypes.mockResolvedValueOnce({ error: 'HTTP 500' })

      const result = await runWithTimers(resolveTypes([34]))

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Unknown Type 34')
    })

    it('handles network errors gracefully and creates placeholder', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      mockRefTypes.mockRejectedValueOnce(new Error('Network error'))

      const result = await runWithTimers(resolveTypes([34]))

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Unknown Type 34')
    })

    it('chunks requests for large type lists', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      const largeList = Array.from({ length: 1500 }, (_, i) => i + 1)

      mockRefTypes.mockResolvedValue({ items: {} })

      await runWithTimers(resolveTypes(largeList))

      expect(mockRefTypes).toHaveBeenCalledTimes(2)
    })
  })

  describe('resolveLocations', () => {
    it('returns empty map for empty input', async () => {
      const result = await runWithTimers(resolveLocations([]))
      expect(result.size).toBe(0)
    })

    it('skips player structure IDs (> 1 trillion) in batch but returns cached if available', async () => {
      vi.mocked(hasLocation).mockReturnValue(false)
      vi.mocked(getLocation).mockReturnValue(undefined)
      const result = await runWithTimers(resolveLocations([1000000000001]))
      expect(result.size).toBe(0)
    })

    it('uses cached locations when available', async () => {
      vi.mocked(hasLocation).mockReturnValue(true)
      vi.mocked(getLocation).mockReturnValue({
        id: 60003760,
        name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        type: 'station',
        solarSystemId: 30000142,
        solarSystemName: 'Jita',
        regionId: 10000002,
        regionName: 'The Forge',
      })

      const result = await runWithTimers(resolveLocations([60003760]))

      expect(result.size).toBe(1)
      expect(result.get(60003760)?.name).toContain('Jita')
      expect(mockRefUniverse).not.toHaveBeenCalled()
    })

    it('fetches uncached locations from API', async () => {
      vi.mocked(hasLocation).mockReturnValue(false)

      mockRefUniverse.mockResolvedValueOnce({
        items: {
          '60003760': {
            type: 'station',
            name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
            solarSystemId: 30000142,
            solarSystemName: 'Jita',
            regionId: 10000002,
            regionName: 'The Forge',
          },
        },
      })

      const result = await runWithTimers(resolveLocations([60003760]))

      expect(result.size).toBe(1)
      expect(result.get(60003760)?.name).toContain('Jita')
      expect(saveLocations).toHaveBeenCalled()
    })

    it('handles API errors gracefully', async () => {
      vi.mocked(hasLocation).mockReturnValue(false)
      vi.mocked(getLocation).mockReturnValue(undefined)

      mockRefUniverse.mockResolvedValueOnce({ error: 'HTTP 500' })

      const result = await runWithTimers(resolveLocations([60003760]))

      expect(result.size).toBe(0)
      expect(saveLocations).not.toHaveBeenCalled()
    })

    it('caches placeholder for locations not returned by API', async () => {
      vi.mocked(hasLocation).mockReturnValue(false)

      mockRefUniverse.mockResolvedValueOnce({
        items: {
          '60003760': {
            type: 'station',
            name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
            solarSystemId: 30000142,
            solarSystemName: 'Jita',
            regionId: 10000002,
            regionName: 'The Forge',
          },
        },
      })

      const result = await runWithTimers(resolveLocations([60003760, 99999]))

      expect(result.size).toBe(2)
      expect(result.get(60003760)?.name).toContain('Jita')
      expect(result.get(99999)?.name).toBe('Unknown Location 99999')
      expect(saveLocations).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 60003760 }),
          expect.objectContaining({ id: 99999, name: 'Unknown Location 99999' }),
        ])
      )
    })
  })

  describe('fetchPrices', () => {
    it('returns empty map for empty input', async () => {
      const result = await fetchPrices([])
      expect(result.size).toBe(0)
    })

    it('extracts prices from /market/jita', async () => {
      mockRefMarketJita.mockResolvedValueOnce({
        items: {
          '34': 5.5,
        },
      })

      const result = await fetchPrices([34])

      expect(result.get(34)).toBe(5.5)
      expect(mockRefMarketJita).toHaveBeenCalledWith([34])
    })

    it('excludes null prices', async () => {
      mockRefMarketJita.mockResolvedValueOnce({
        items: {
          '34': null,
        },
      })

      const result = await fetchPrices([34])

      expect(result.has(34)).toBe(false)
    })

    it('excludes zero prices', async () => {
      mockRefMarketJita.mockResolvedValueOnce({
        items: {
          '34': 0,
        },
      })

      const result = await fetchPrices([34])

      expect(result.has(34)).toBe(false)
    })

    it('handles multiple items', async () => {
      mockRefMarketJita.mockResolvedValueOnce({
        items: {
          '34': 5.5,
          '35': 10.0,
          '36': null,
        },
      })

      const result = await fetchPrices([34, 35, 36])

      expect(result.get(34)).toBe(5.5)
      expect(result.get(35)).toBe(10.0)
      expect(result.has(36)).toBe(false)
    })
  })
})
