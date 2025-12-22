import { describe, it, expect, beforeAll, vi } from 'vitest'
import {
  CategoryIds,
  LocationFlags,
  initCache,
  getType,
  getTypeName,
  hasType,
  getStructure,
  hasStructure,
  getLocation,
  hasLocation,
  getLocationName,
  getAbyssal,
  hasAbyssal,
  getAbyssalPrice,
  saveTypes,
  saveStructures,
  saveLocations,
  saveAbyssals,
  subscribe,
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

describe('Reference Cache', () => {
  beforeAll(async () => {
    await initCache()
  })

  describe('initCache', () => {
    it('is idempotent', async () => {
      await expect(initCache()).resolves.not.toThrow()
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

      await saveTypes([testType])

      expect(hasType(34)).toBe(true)
      expect(getType(34)).toEqual(testType)
      expect(getTypeName(34)).toBe('Tritanium')
    })

    it('saveTypes with empty array does nothing', async () => {
      await expect(saveTypes([])).resolves.not.toThrow()
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

      await saveStructures([testStructure])

      expect(hasStructure(1000000000001)).toBe(true)
      expect(getStructure(1000000000001)).toEqual(testStructure)
    })

    it('saveStructures with empty array does nothing', async () => {
      await expect(saveStructures([])).resolves.not.toThrow()
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

      await saveLocations([testLocation])

      expect(hasLocation(60003760)).toBe(true)
      expect(getLocation(60003760)).toEqual(testLocation)
    })

    it('saveLocations with empty array does nothing', async () => {
      await expect(saveLocations([])).resolves.not.toThrow()
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

  describe('abyssals', () => {
    it('getAbyssal returns undefined for unknown abyssal', () => {
      expect(getAbyssal(99999999)).toBeUndefined()
    })

    it('hasAbyssal returns false for unknown abyssal', () => {
      expect(hasAbyssal(99999999)).toBe(false)
    })

    it('getAbyssalPrice returns undefined for unknown abyssal', () => {
      expect(getAbyssalPrice(99999999)).toBeUndefined()
    })

    it('saveAbyssals and getAbyssal work together', async () => {
      const testAbyssal = {
        id: 12345678,
        price: 500000000,
        fetchedAt: Date.now(),
      }

      await saveAbyssals([testAbyssal])

      expect(hasAbyssal(12345678)).toBe(true)
      expect(getAbyssal(12345678)).toEqual(testAbyssal)
      expect(getAbyssalPrice(12345678)).toBe(500000000)
    })

    it('saveAbyssals with empty array does nothing', async () => {
      await expect(saveAbyssals([])).resolves.not.toThrow()
    })
  })

  describe('subscribe', () => {
    it('notifies listeners on save', async () => {
      const listener = vi.fn()
      const unsubscribe = subscribe(listener)

      await saveTypes([
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

      expect(listener).toHaveBeenCalled()
      unsubscribe()
    })

    it('unsubscribe stops notifications', async () => {
      const listener = vi.fn()
      const unsubscribe = subscribe(listener)
      unsubscribe()

      await saveTypes([
        {
          id: 36,
          name: 'Mexallon',
          groupId: 18,
          groupName: 'Mineral',
          categoryId: 4,
          categoryName: 'Material',
          volume: 0.01,
        },
      ])

      expect(listener).not.toHaveBeenCalled()
    })
  })
})
