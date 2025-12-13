import {
  hasLocation,
  getLocation,
  hasStructure,
  getStructure,
} from '@/store/reference-cache'

export function getLocationName(locationId: number | undefined): string {
  if (!locationId) return '-'
  if (locationId > 1_000_000_000_000) {
    const structure = hasStructure(locationId) ? getStructure(locationId) : undefined
    return structure?.name ?? `Structure ${locationId}`
  }
  const location = hasLocation(locationId) ? getLocation(locationId) : undefined
  return location?.name ?? `Location ${locationId}`
}

export interface LocationInfo {
  name: string
  regionName: string
  systemName: string
}

export function getLocationInfo(locationId: number): LocationInfo {
  if (locationId > 1_000_000_000_000) {
    const structure = hasStructure(locationId) ? getStructure(locationId) : undefined
    return {
      name: structure?.name ?? `Structure ${locationId}`,
      regionName: '',
      systemName: '',
    }
  }
  const location = hasLocation(locationId) ? getLocation(locationId) : undefined
  return {
    name: location?.name ?? `Location ${locationId}`,
    regionName: location?.regionName ?? '',
    systemName: location?.solarSystemName ?? '',
  }
}
