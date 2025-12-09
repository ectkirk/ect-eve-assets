import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveTypes, resolveLocations, fetchPrices } from './ref-client'

vi.mock('@/store/reference-cache', () => ({
  getType: vi.fn(),
  saveTypes: vi.fn(),
  hasLocation: vi.fn(),
  getLocation: vi.fn(),
  saveLocations: vi.fn(),
}))

import { getType, saveTypes, hasLocation, getLocation, saveLocations } from '@/store/reference-cache'

describe('ref-client', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  describe('resolveTypes', () => {
    it('returns empty map for empty input', async () => {
      const result = await resolveTypes([])
      expect(result.size).toBe(0)
      expect(fetchSpy).not.toHaveBeenCalled()
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

      const result = await resolveTypes([34])

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Tritanium')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('fetches uncached types from API', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: {
              '34': {
                id: 34,
                name: 'Tritanium',
                groupId: 18,
                groupName: 'Mineral',
                categoryId: 4,
                categoryName: 'Material',
                volume: 0.01,
                marketPrice: { lowestSell: 5 },
              },
            },
          }),
          { status: 200 }
        )
      )

      const result = await resolveTypes([34])

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Tritanium')
      expect(saveTypes).toHaveBeenCalled()
    })

    it('creates placeholder for types not returned by API', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: {} }), { status: 200 })
      )

      const result = await resolveTypes([99999])

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

      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: {} }), { status: 200 })
      )

      await resolveTypes([99999])

      expect(fetchSpy).toHaveBeenCalled()
    })

    it('handles API errors gracefully and creates placeholder', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      fetchSpy.mockResolvedValueOnce(new Response('Error', { status: 500 }))

      const result = await resolveTypes([34])

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Unknown Type 34')
    })

    it('handles network errors gracefully and creates placeholder', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      fetchSpy.mockRejectedValueOnce(new Error('Network error'))

      const result = await resolveTypes([34])

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Unknown Type 34')
    })

    it('chunks requests for large type lists', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      const largeList = Array.from({ length: 1500 }, (_, i) => i + 1)

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ items: {} }), { status: 200 })
      )

      await resolveTypes(largeList)

      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('resolveLocations', () => {
    it('returns empty map for empty input', async () => {
      const result = await resolveLocations([])
      expect(result.size).toBe(0)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('skips player structure IDs (> 1 trillion)', async () => {
      const result = await resolveLocations([1000000000001])
      expect(result.size).toBe(0)
      expect(fetchSpy).not.toHaveBeenCalled()
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

      const result = await resolveLocations([60003760])

      expect(result.size).toBe(1)
      expect(result.get(60003760)?.name).toContain('Jita')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('fetches uncached locations from API', async () => {
      vi.mocked(hasLocation).mockReturnValue(false)

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
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
          }),
          { status: 200 }
        )
      )

      const result = await resolveLocations([60003760])

      expect(result.size).toBe(1)
      expect(result.get(60003760)?.name).toContain('Jita')
      expect(saveLocations).toHaveBeenCalled()
    })

    it('handles API errors gracefully', async () => {
      vi.mocked(hasLocation).mockReturnValue(false)

      fetchSpy.mockResolvedValueOnce(new Response('Error', { status: 500 }))

      const result = await resolveLocations([60003760])

      expect(result.size).toBe(0)
    })
  })

  describe('fetchPrices', () => {
    it('returns empty map for empty input', async () => {
      const result = await fetchPrices([])
      expect(result.size).toBe(0)
    })

    it('extracts lowestSell price', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: {
              '34': {
                id: 34,
                name: 'Tritanium',
                marketPrice: { lowestSell: 5.5 },
              },
            },
          }),
          { status: 200 }
        )
      )

      const result = await fetchPrices([34])

      expect(result.get(34)).toBe(5.5)
    })

    it('falls back to average price if no lowestSell', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: {
              '34': {
                id: 34,
                name: 'Tritanium',
                marketPrice: { average: '4.5' },
              },
            },
          }),
          { status: 200 }
        )
      )

      const result = await fetchPrices([34])

      expect(result.get(34)).toBe(4.5)
    })

    it('handles numeric average', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: {
              '34': {
                id: 34,
                name: 'Tritanium',
                marketPrice: { average: 4.5 },
              },
            },
          }),
          { status: 200 }
        )
      )

      const result = await fetchPrices([34])

      expect(result.get(34)).toBe(4.5)
    })

    it('excludes zero prices', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: {
              '34': {
                id: 34,
                name: 'Tritanium',
                marketPrice: { lowestSell: 0 },
              },
            },
          }),
          { status: 200 }
        )
      )

      const result = await fetchPrices([34])

      expect(result.has(34)).toBe(false)
    })

    it('caches type data from price response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: {
              '34': {
                id: 34,
                name: 'Tritanium',
                groupId: 18,
                groupName: 'Mineral',
                categoryId: 4,
                categoryName: 'Material',
                volume: 0.01,
                marketPrice: { lowestSell: 5 },
              },
            },
          }),
          { status: 200 }
        )
      )

      await fetchPrices([34])

      expect(saveTypes).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 34, name: 'Tritanium' }),
        ])
      )
    })
  })
})
