import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveTypes,
  resolveLocations,
  fetchPrices,
  loadReferenceData,
  loadUniverseData,
  _resetForTests,
} from './ref-client'

const mockSaveTypes = vi.fn()
const mockSaveLocations = vi.fn()
const mockSetCategories = vi.fn()
const mockSetGroups = vi.fn()
const mockSetCorporations = vi.fn()
const mockSetRegions = vi.fn()
const mockSetSystems = vi.fn()
const mockSetStations = vi.fn()
const mockSetStargates = vi.fn()
const mockSetRefStructures = vi.fn()
const mockSetAllTypesLoaded = vi.fn()
const mockSetUniverseDataLoaded = vi.fn()
const mockSetRefStructuresLoaded = vi.fn()

vi.mock('@/store/reference-cache', () => ({
  getType: vi.fn(),
  getLocation: vi.fn(),
  getGroup: vi.fn(),
  getCategory: vi.fn(),
  getSystem: vi.fn(),
  getRegion: vi.fn(),
  isReferenceDataLoaded: vi.fn(() => true),
  isAllTypesLoaded: vi.fn(() => false),
  isUniverseDataLoaded: vi.fn(() => false),
  isRefStructuresLoaded: vi.fn(() => false),
  isTypePublished: vi.fn(() => true),
  isTypeMarketable: vi.fn(() => true),
  useReferenceCacheStore: {
    getState: () => ({
      saveTypes: mockSaveTypes,
      saveLocations: mockSaveLocations,
      setCategories: mockSetCategories,
      setGroups: mockSetGroups,
      setCorporations: mockSetCorporations,
      setRegions: mockSetRegions,
      setSystems: mockSetSystems,
      setStations: mockSetStations,
      setStargates: mockSetStargates,
      setRefStructures: mockSetRefStructures,
      setAllTypesLoaded: mockSetAllTypesLoaded,
      setUniverseDataLoaded: mockSetUniverseDataLoaded,
      setRefStructuresLoaded: mockSetRefStructuresLoaded,
    }),
  },
}))

import {
  getType,
  getLocation,
  getGroup,
  getCategory,
  getSystem,
  getRegion,
  isReferenceDataLoaded,
  isAllTypesLoaded,
  isUniverseDataLoaded,
} from '@/store/reference-cache'

const mockRefTypesPage = vi.fn()
const mockRefMoons = vi.fn()
const mockRefMarketJita = vi.fn()
const mockRefCategories = vi.fn()
const mockRefGroups = vi.fn()
const mockRefCorporations = vi.fn()
const mockRefUniverseRegions = vi.fn()
const mockRefUniverseSystems = vi.fn()
const mockRefUniverseStations = vi.fn()
const mockRefUniverseStargates = vi.fn()

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

    mockRefCategories.mockResolvedValue({
      items: { '4': { id: 4, name: 'Material', published: true } },
    })
    mockRefGroups.mockResolvedValue({
      items: {
        '18': { id: 18, name: 'Mineral', categoryId: 4, published: true },
      },
    })
    mockRefCorporations.mockResolvedValue({
      items: {
        '1000182': {
          id: 1000182,
          name: 'Tribal Liberation Force',
          tickerName: 'TLIB',
          factionId: 500002,
        },
      },
    })
    mockRefTypesPage.mockResolvedValue({
      items: {},
      pagination: { total: 0, limit: 5000, hasMore: false },
      etag: 'test-etag',
    })

    mockRefUniverseRegions.mockResolvedValue({
      items: { '10000002': { id: 10000002, name: 'The Forge' } },
    })
    mockRefUniverseSystems.mockResolvedValue({
      items: {
        '30000142': {
          id: 30000142,
          name: 'Jita',
          regionId: 10000002,
          securityStatus: 0.9,
        },
      },
    })
    mockRefUniverseStations.mockResolvedValue({
      items: {
        '60003760': {
          id: 60003760,
          name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
          systemId: 30000142,
        },
      },
    })
    mockRefUniverseStargates.mockResolvedValue({
      items: {
        '5000000030000142': {
          id: 5000000030000142,
          from: 30000142,
          to: 30000144,
        },
      },
    })

    window.electronAPI = {
      refTypesPage: mockRefTypesPage,
      refMoons: mockRefMoons,
      refMarketJita: mockRefMarketJita,
      refCategories: mockRefCategories,
      refGroups: mockRefGroups,
      refCorporations: mockRefCorporations,
      refUniverseRegions: mockRefUniverseRegions,
      refUniverseSystems: mockRefUniverseSystems,
      refUniverseStations: mockRefUniverseStations,
      refUniverseStargates: mockRefUniverseStargates,
    } as unknown as typeof window.electronAPI
  })

  describe('resolveTypes', () => {
    it('returns empty map for empty input', async () => {
      const result = await runWithTimers(resolveTypes([]))
      expect(result.size).toBe(0)
    })

    it('returns cached types', async () => {
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
    })

    it('returns empty for uncached types', async () => {
      vi.mocked(getType).mockReturnValue(undefined)

      const result = await runWithTimers(resolveTypes([99999]))

      expect(result.size).toBe(0)
    })

    it('returns only cached types from mixed input', async () => {
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

      const result = await runWithTimers(resolveTypes([34, 99999]))

      expect(result.size).toBe(1)
      expect(result.get(34)?.name).toBe('Tritanium')
      expect(result.has(99999)).toBe(false)
    })
  })

  describe('resolveLocations', () => {
    it('returns empty map for empty input', async () => {
      const result = await runWithTimers(resolveLocations([]))
      expect(result.size).toBe(0)
    })

    it('skips player structure IDs (> 1 trillion)', async () => {
      vi.mocked(getLocation).mockReturnValue(undefined)
      const result = await runWithTimers(resolveLocations([1000000000001]))
      expect(result.size).toBe(0)
    })

    it('uses cached locations when available', async () => {
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
      expect(mockRefMoons).not.toHaveBeenCalled()
    })

    it('fetches uncached moons from API', async () => {
      vi.mocked(getLocation).mockReturnValue(undefined)
      vi.mocked(getSystem).mockReturnValue({
        id: 30000142,
        name: 'Jita',
        regionId: 10000002,
        securityStatus: 0.9,
      })
      vi.mocked(getRegion).mockReturnValue({ id: 10000002, name: 'The Forge' })

      mockRefMoons.mockResolvedValueOnce({
        items: {
          '40009082': {
            id: 40009082,
            name: 'Jita IV - Moon 4',
            systemId: 30000142,
          },
        },
      })

      const result = await runWithTimers(resolveLocations([40009082]))

      expect(result.size).toBe(1)
      expect(result.get(40009082)?.name).toBe('Jita IV - Moon 4')
      expect(result.get(40009082)?.type).toBe('celestial')
      expect(mockSaveLocations).toHaveBeenCalled()
    })

    it('handles API errors gracefully', async () => {
      vi.mocked(getLocation).mockReturnValue(undefined)

      mockRefMoons.mockResolvedValueOnce({ error: 'HTTP 500' })

      const result = await runWithTimers(resolveLocations([40009082]))

      expect(result.size).toBe(1)
      expect(result.get(40009082)?.name).toBe('Celestial 40009082')
      expect(mockSaveLocations).toHaveBeenCalled()
    })

    it('caches placeholder for moons not returned by API', async () => {
      vi.mocked(getLocation).mockReturnValue(undefined)
      vi.mocked(getSystem).mockReturnValue({
        id: 30000142,
        name: 'Jita',
        regionId: 10000002,
        securityStatus: 0.9,
      })
      vi.mocked(getRegion).mockReturnValue({ id: 10000002, name: 'The Forge' })

      mockRefMoons.mockResolvedValueOnce({
        items: {
          '40009082': {
            id: 40009082,
            name: 'Jita IV - Moon 4',
            systemId: 30000142,
          },
        },
      })

      const result = await runWithTimers(resolveLocations([40009082, 40099999]))

      expect(result.size).toBe(2)
      expect(result.get(40009082)?.name).toBe('Jita IV - Moon 4')
      expect(result.get(40099999)?.name).toBe('Celestial 40099999')
      expect(result.get(40099999)?.type).toBe('celestial')
      expect(mockSaveLocations).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 40009082, name: 'Jita IV - Moon 4' }),
          expect.objectContaining({
            id: 40099999,
            name: 'Celestial 40099999',
            type: 'celestial',
          }),
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
      expect(mockRefMarketJita).toHaveBeenCalledWith({ typeIds: [34] })
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

  describe('loadReferenceData', () => {
    it('skips loading if reference data and all types already loaded', async () => {
      vi.mocked(isReferenceDataLoaded).mockReturnValue(true)
      vi.mocked(isAllTypesLoaded).mockReturnValue(true)

      await loadReferenceData()

      expect(mockRefCategories).not.toHaveBeenCalled()
      expect(mockRefGroups).not.toHaveBeenCalled()
      expect(mockRefTypesPage).not.toHaveBeenCalled()
    })

    it('loads categories and groups when not loaded', async () => {
      vi.mocked(isReferenceDataLoaded).mockReturnValue(false)
      vi.mocked(isAllTypesLoaded).mockReturnValue(false)

      await loadReferenceData()

      expect(mockRefCategories).toHaveBeenCalled()
      expect(mockRefGroups).toHaveBeenCalled()
      expect(mockSetCategories).toHaveBeenCalledWith([
        { id: 4, name: 'Material', published: true },
      ])
      expect(mockSetGroups).toHaveBeenCalledWith([
        { id: 18, name: 'Mineral', categoryId: 4, published: true },
      ])
    })

    it('loads all types with cursor pagination', async () => {
      vi.mocked(isReferenceDataLoaded).mockReturnValue(true)
      vi.mocked(isAllTypesLoaded).mockReturnValue(false)

      mockRefTypesPage
        .mockResolvedValueOnce({
          items: {
            '34': { id: 34, name: 'Tritanium', groupId: 18, volume: 0.01 },
          },
          pagination: { total: 2, limit: 1, hasMore: true, nextCursor: 34 },
        })
        .mockResolvedValueOnce({
          items: {
            '35': { id: 35, name: 'Pyerite', groupId: 18, volume: 0.01 },
          },
          pagination: { total: 2, limit: 1, hasMore: false },
        })

      await loadReferenceData()

      expect(mockRefTypesPage).toHaveBeenCalledTimes(2)
      expect(mockRefTypesPage).toHaveBeenNthCalledWith(1, {
        after: undefined,
        language: 'en',
      })
      expect(mockRefTypesPage).toHaveBeenNthCalledWith(2, {
        after: 34,
        language: 'en',
      })
      expect(mockSaveTypes).toHaveBeenCalledTimes(2)
      expect(mockSetAllTypesLoaded).toHaveBeenCalledWith(true)
    })

    it('handles categories API error gracefully and continues loading', async () => {
      vi.mocked(isReferenceDataLoaded).mockReturnValue(false)
      vi.mocked(isAllTypesLoaded).mockReturnValue(false)

      mockRefCategories.mockResolvedValueOnce({ error: 'HTTP 500' })

      await loadReferenceData()

      expect(mockSetCategories).not.toHaveBeenCalled()
      expect(mockSetGroups).toHaveBeenCalled()
      expect(mockRefTypesPage).toHaveBeenCalled()
    })

    it('handles types page API error gracefully', async () => {
      vi.mocked(isReferenceDataLoaded).mockReturnValue(true)
      vi.mocked(isAllTypesLoaded).mockReturnValue(false)

      mockRefTypesPage.mockResolvedValueOnce({ error: 'HTTP 500' })

      await loadReferenceData()

      expect(mockSetAllTypesLoaded).not.toHaveBeenCalled()
    })

    it('deduplicates concurrent calls', async () => {
      vi.mocked(isReferenceDataLoaded).mockReturnValue(true)
      vi.mocked(isAllTypesLoaded).mockReturnValue(false)

      const promise1 = loadReferenceData()
      const promise2 = loadReferenceData()

      await Promise.all([promise1, promise2])

      expect(mockRefTypesPage).toHaveBeenCalledTimes(1)
    })

    it('enriches types with group and category names', async () => {
      vi.mocked(isReferenceDataLoaded).mockReturnValue(true)
      vi.mocked(isAllTypesLoaded).mockReturnValue(false)

      mockRefTypesPage.mockResolvedValueOnce({
        items: {
          '34': { id: 34, name: 'Tritanium', groupId: 18, volume: 0.01 },
        },
        pagination: { total: 1, limit: 5000, hasMore: false },
        etag: 'test-etag',
      })

      await loadReferenceData()

      expect(mockSaveTypes).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 34,
          name: 'Tritanium',
          groupId: 18,
          groupName: 'Mineral',
          categoryId: 4,
          categoryName: 'Material',
          volume: 0.01,
        }),
      ])
    })

    it('handles nullable groupId and volume from API', async () => {
      vi.mocked(isReferenceDataLoaded).mockReturnValue(true)
      vi.mocked(isAllTypesLoaded).mockReturnValue(false)

      mockRefTypesPage.mockResolvedValueOnce({
        items: {
          '99999': {
            id: 99999,
            name: 'Unknown Item',
            groupId: null,
            volume: null,
          },
        },
        pagination: { total: 1, limit: 5000, hasMore: false },
        etag: 'test-etag',
      })

      await loadReferenceData()

      expect(mockSaveTypes).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 99999,
          name: 'Unknown Item',
          groupId: 0,
          groupName: '',
          categoryId: 0,
          categoryName: '',
          volume: 0,
        }),
      ])
    })
  })

  describe('loadUniverseData', () => {
    it('skips loading if universe data already loaded', async () => {
      vi.mocked(isUniverseDataLoaded).mockReturnValue(true)

      await loadUniverseData()

      expect(mockRefUniverseRegions).not.toHaveBeenCalled()
      expect(mockRefUniverseSystems).not.toHaveBeenCalled()
      expect(mockRefUniverseStations).not.toHaveBeenCalled()
    })

    it('loads regions, systems, stations, and stargates when not loaded', async () => {
      vi.mocked(isUniverseDataLoaded).mockReturnValue(false)

      await loadUniverseData()

      expect(mockRefUniverseRegions).toHaveBeenCalled()
      expect(mockRefUniverseSystems).toHaveBeenCalled()
      expect(mockRefUniverseStations).toHaveBeenCalled()
      expect(mockRefUniverseStargates).toHaveBeenCalled()
      expect(mockSetRegions).toHaveBeenCalledWith([
        { id: 10000002, name: 'The Forge' },
      ])
      expect(mockSetSystems).toHaveBeenCalledWith([
        {
          id: 30000142,
          name: 'Jita',
          regionId: 10000002,
          securityStatus: 0.9,
          position2D: undefined,
        },
      ])
      expect(mockSetStations).toHaveBeenCalledWith([
        {
          id: 60003760,
          name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
          systemId: 30000142,
        },
      ])
      expect(mockSetStargates).toHaveBeenCalledWith([
        { id: 5000000030000142, from: 30000142, to: 30000144 },
      ])
      expect(mockSetUniverseDataLoaded).toHaveBeenCalledWith(true)
    })

    it('handles regions API error gracefully', async () => {
      vi.mocked(isUniverseDataLoaded).mockReturnValue(false)

      mockRefUniverseRegions.mockResolvedValueOnce({ error: 'HTTP 500' })

      await loadUniverseData()

      expect(mockSetRegions).not.toHaveBeenCalled()
      expect(mockRefUniverseSystems).toHaveBeenCalled()
    })

    it('handles systems API error gracefully', async () => {
      vi.mocked(isUniverseDataLoaded).mockReturnValue(false)

      mockRefUniverseSystems.mockResolvedValueOnce({ error: 'HTTP 500' })

      await loadUniverseData()

      expect(mockSetSystems).not.toHaveBeenCalled()
      expect(mockRefUniverseStations).toHaveBeenCalled()
    })

    it('handles stations API error gracefully', async () => {
      vi.mocked(isUniverseDataLoaded).mockReturnValue(false)

      mockRefUniverseStations.mockResolvedValueOnce({ error: 'HTTP 500' })

      await loadUniverseData()

      expect(mockSetStations).not.toHaveBeenCalled()
      expect(mockSetUniverseDataLoaded).toHaveBeenCalledWith(true)
    })

    it('deduplicates concurrent calls', async () => {
      vi.mocked(isUniverseDataLoaded).mockReturnValue(false)

      const promise1 = loadUniverseData()
      const promise2 = loadUniverseData()

      await Promise.all([promise1, promise2])

      expect(mockRefUniverseRegions).toHaveBeenCalledTimes(1)
      expect(mockRefUniverseSystems).toHaveBeenCalledTimes(1)
      expect(mockRefUniverseStations).toHaveBeenCalledTimes(1)
    })
  })
})
