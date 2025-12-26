import { describe, it, expect, beforeAll } from 'vitest'
import {
  CategoryIds,
  LocationFlags,
  getType,
  getTypeName,
  hasType,
  getStructure,
  hasStructure,
  getLocation,
  hasLocation,
  getLocationName,
  useReferenceCacheStore,
} from './reference-cache'

describe('CategoryIds', () => {
  it('has correct EVE category IDs', () => {
    expect(CategoryIds.SHIP).toBe(6)
    expect(CategoryIds.MODULE).toBe(7)
    expect(CategoryIds.CHARGE).toBe(8)
    expect(CategoryIds.BLUEPRINT).toBe(9)
    expect(CategoryIds.SKILL).toBe(16)
    expect(CategoryIds.DRONE).toBe(18)
    expect(CategoryIds.IMPLANT).toBe(20)
    expect(CategoryIds.STRUCTURE).toBe(65)
    expect(CategoryIds.SKIN).toBe(91)
  })
})

describe('LocationFlags', () => {
  it('has correct location flag values', () => {
    expect(LocationFlags.HANGAR).toBe(4)
    expect(LocationFlags.CARGO).toBe(5)
    expect(LocationFlags.SHIP_HANGAR).toBe(90)
    expect(LocationFlags.DELIVERIES).toBe(173)
    expect(LocationFlags.CORP_DELIVERIES).toBe(62)
    expect(LocationFlags.ASSET_SAFETY).toBe(36)
    expect(LocationFlags.CLONE_BAY).toBe(89)
  })
})

const store = () => useReferenceCacheStore.getState()

describe('Reference Cache', () => {
  beforeAll(async () => {
    await store().init()
  })

  describe('init', () => {
    it('is idempotent', async () => {
      await expect(store().init()).resolves.not.toThrow()
    })
  })

  describe('types', () => {
    it('getType returns undefined for unknown type', () => {
      expect(getType(99999999)).toBeUndefined()
    })

    it('getTypeName returns fallback for unknown type', () => {
      expect(getTypeName(99999999)).toBe('Unknown Type 99999999')
    })

    it('hasType returns false for unknown type', () => {
      expect(hasType(99999999)).toBe(false)
    })

    it('saveTypes and getType work together', async () => {
      const testType = {
        id: 34,
        name: 'Tritanium',
        groupId: 18,
        groupName: 'Mineral',
        categoryId: 4,
        categoryName: 'Material',
        volume: 0.01,
      }

      await store().saveTypes([testType])

      expect(hasType(34)).toBe(true)
      expect(getType(34)).toEqual(testType)
      expect(getTypeName(34)).toBe('Tritanium')
    })

    it('saveTypes with empty array does nothing', async () => {
      await expect(store().saveTypes([])).resolves.not.toThrow()
    })
  })

  describe('structures', () => {
    it('getStructure returns undefined for unknown structure', () => {
      expect(getStructure(99999999)).toBeUndefined()
    })

    it('hasStructure returns false for unknown structure', () => {
      expect(hasStructure(99999999)).toBe(false)
    })

    it('saveStructures and getStructure work together', async () => {
      const testStructure = {
        id: 1000000000001,
        name: 'Test Citadel',
        solarSystemId: 30000142,
        typeId: 35832,
        ownerId: 12345,
      }

      await store().saveStructures([testStructure])

      expect(hasStructure(1000000000001)).toBe(true)
      expect(getStructure(1000000000001)).toEqual(testStructure)
    })

    it('saveStructures with empty array does nothing', async () => {
      await expect(store().saveStructures([])).resolves.not.toThrow()
    })
  })

  describe('locations', () => {
    it('getLocation returns undefined for unknown location', () => {
      expect(getLocation(99999999)).toBeUndefined()
    })

    it('hasLocation returns false for unknown location', () => {
      expect(hasLocation(99999999)).toBe(false)
    })

    it('saveLocations and getLocation work together', async () => {
      const testLocation = {
        id: 60003760,
        name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        type: 'station' as const,
        solarSystemId: 30000142,
        solarSystemName: 'Jita',
        regionId: 10000002,
        regionName: 'The Forge',
      }

      await store().saveLocations([testLocation])

      expect(hasLocation(60003760)).toBe(true)
      expect(getLocation(60003760)).toEqual(testLocation)
    })

    it('saveLocations with empty array does nothing', async () => {
      await expect(store().saveLocations([])).resolves.not.toThrow()
    })
  })

  describe('getLocationName', () => {
    it('returns structure name for high IDs', () => {
      expect(getLocationName(1000000000001)).toBe('Test Citadel')
    })

    it('returns fallback for unknown structure', () => {
      expect(getLocationName(1000000000999)).toBe('Structure 1000000000999')
    })

    it('returns location name for low IDs', () => {
      expect(getLocationName(60003760)).toBe(
        'Jita IV - Moon 4 - Caldari Navy Assembly Plant'
      )
    })

    it('returns fallback for unknown location', () => {
      expect(getLocationName(99999999)).toBe('Location 99999999')
    })
  })

  describe('zustand store', () => {
    it('exports useReferenceCacheStore hook', () => {
      expect(useReferenceCacheStore).toBeDefined()
    })

    it('store has types Map', () => {
      const state = useReferenceCacheStore.getState()
      expect(state.types).toBeInstanceOf(Map)
    })

    it('store updates trigger state changes', async () => {
      const initialTypes = useReferenceCacheStore.getState().types
      await store().saveTypes([
        {
          id: 35,
          name: 'Pyerite',
          groupId: 18,
          groupName: 'Mineral',
          categoryId: 4,
          categoryName: 'Material',
          volume: 0.01,
        },
      ])
      const newTypes = useReferenceCacheStore.getState().types
      expect(newTypes).not.toBe(initialTypes)
      expect(newTypes.get(35)?.name).toBe('Pyerite')
    })
  })
})
