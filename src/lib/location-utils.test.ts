import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getLocationName, getLocationInfo } from './location-utils'

vi.mock('@/store/reference-cache', () => ({
  getLocation: vi.fn(),
  getStructure: vi.fn(),
}))

import { getLocation, getStructure } from '@/store/reference-cache'

const mockGetLocation = vi.mocked(getLocation)
const mockGetStructure = vi.mocked(getStructure)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getLocationName', () => {
  it('returns "-" for undefined locationId', () => {
    expect(getLocationName(undefined)).toBe('-')
  })

  it('returns structure name for structure IDs', () => {
    mockGetStructure.mockReturnValue({
      id: 1_000_000_000_001,
      name: 'Test Structure',
      solarSystemId: 30000142,
      typeId: 35832,
      ownerId: 98000001,
    })

    expect(getLocationName(1_000_000_000_001)).toBe('Test Structure')
    expect(mockGetStructure).toHaveBeenCalledWith(1_000_000_000_001)
  })

  it('returns fallback for unknown structures', () => {
    mockGetStructure.mockReturnValue(undefined)

    expect(getLocationName(1_000_000_000_001)).toBe('Structure 1000000000001')
  })

  it('returns location name for station IDs', () => {
    mockGetLocation.mockReturnValue({
      id: 60003760,
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      type: 'station',
      regionName: 'The Forge',
      solarSystemName: 'Jita',
    })

    expect(getLocationName(60003760)).toBe(
      'Jita IV - Moon 4 - Caldari Navy Assembly Plant'
    )
    expect(mockGetLocation).toHaveBeenCalledWith(60003760)
  })

  it('returns fallback for unknown locations', () => {
    mockGetLocation.mockReturnValue(undefined)

    expect(getLocationName(60003760)).toBe('Location 60003760')
  })
})

describe('getLocationInfo', () => {
  it('returns structure info for structure IDs', () => {
    mockGetStructure.mockReturnValue({
      id: 1_000_000_000_001,
      name: 'Test Structure',
      solarSystemId: 30000142,
      typeId: 35832,
      ownerId: 98000001,
    })

    const info = getLocationInfo(1_000_000_000_001)
    expect(info.name).toBe('Test Structure')
    expect(info.regionName).toBe('')
    expect(info.systemName).toBe('')
  })

  it('returns fallback info for unknown structures', () => {
    mockGetStructure.mockReturnValue(undefined)

    const info = getLocationInfo(1_000_000_000_001)
    expect(info.name).toBe('Structure 1000000000001')
    expect(info.regionName).toBe('')
    expect(info.systemName).toBe('')
  })

  it('returns full location info for stations', () => {
    mockGetLocation.mockReturnValue({
      id: 60003760,
      name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
      type: 'station',
      regionName: 'The Forge',
      solarSystemName: 'Jita',
    })

    const info = getLocationInfo(60003760)
    expect(info.name).toBe('Jita IV - Moon 4 - Caldari Navy Assembly Plant')
    expect(info.regionName).toBe('The Forge')
    expect(info.systemName).toBe('Jita')
  })

  it('returns fallback info for unknown locations', () => {
    mockGetLocation.mockReturnValue(undefined)

    const info = getLocationInfo(60003760)
    expect(info.name).toBe('Location 60003760')
    expect(info.regionName).toBe('')
    expect(info.systemName).toBe('')
  })
})
