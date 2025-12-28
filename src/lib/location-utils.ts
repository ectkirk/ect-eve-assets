import { getLocation, getStructure } from '@/store/reference-cache'
import { PLAYER_STRUCTURE_ID_THRESHOLD } from './eve-constants'

export function getLocationName(locationId: number | undefined): string {
  if (!locationId) return '-'
  if (locationId >= PLAYER_STRUCTURE_ID_THRESHOLD) {
    return getStructure(locationId)?.name ?? `Structure ${locationId}`
  }
  return getLocation(locationId)?.name ?? `Location ${locationId}`
}

export interface LocationInfo {
  name: string
  regionName: string
  systemName: string
}

export function getLocationInfo(locationId: number): LocationInfo {
  if (locationId >= PLAYER_STRUCTURE_ID_THRESHOLD) {
    return {
      name: getStructure(locationId)?.name ?? `Structure ${locationId}`,
      regionName: '',
      systemName: '',
    }
  }
  const location = getLocation(locationId)
  return {
    name: location?.name ?? `Location ${locationId}`,
    regionName: location?.regionName ?? '',
    systemName: location?.solarSystemName ?? '',
  }
}
