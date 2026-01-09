import { useReferenceCacheStore } from '.'
import type {
  CachedType,
  CachedCategory,
  CachedGroup,
  CachedRegion,
  CachedSystem,
  CachedStation,
  CachedRefStructure,
  CachedStructure,
  CachedLocation,
  CachedName,
} from './types'
import { PLAYER_STRUCTURE_ID_THRESHOLD } from '@/lib/eve-constants'
import { i18n } from '@/i18n'

export function useType(id: number): CachedType | undefined {
  return useReferenceCacheStore((s) => s.types.get(id))
}

export function useTypeName(id: number): string {
  return useReferenceCacheStore(
    (s) =>
      s.types.get(id)?.name ?? i18n.t('assets:locations.unknownType', { id })
  )
}

export function useCategory(id: number): CachedCategory | undefined {
  return useReferenceCacheStore((s) => s.categories.get(id))
}

export function useGroup(id: number): CachedGroup | undefined {
  return useReferenceCacheStore((s) => s.groups.get(id))
}

export function useRegion(id: number): CachedRegion | undefined {
  return useReferenceCacheStore((s) => s.regions.get(id))
}

export function useSystem(id: number): CachedSystem | undefined {
  return useReferenceCacheStore((s) => s.systems.get(id))
}

export function useStation(id: number): CachedStation | undefined {
  return useReferenceCacheStore((s) => s.stations.get(id))
}

export function useRefStructure(id: number): CachedRefStructure | undefined {
  return useReferenceCacheStore((s) => s.refStructures.get(id))
}

export function useStructure(id: number): CachedStructure | undefined {
  return useReferenceCacheStore((s) => s.structures.get(id))
}

export function useCachedName(id: number): CachedName | undefined {
  return useReferenceCacheStore((s) => s.names.get(id))
}

export function useLocation(id: number): CachedLocation | undefined {
  return useReferenceCacheStore((s) => {
    const cached = s.locations.get(id)
    if (cached) return cached

    const station = s.stations.get(id)
    if (station) {
      const system = s.systems.get(station.systemId)
      const region = system ? s.regions.get(system.regionId) : undefined
      return {
        id,
        name: station.name,
        type: 'station' as const,
        solarSystemId: station.systemId,
        solarSystemName: system?.name,
        regionId: system?.regionId,
        regionName: region?.name,
      }
    }

    const refStructure = s.refStructures.get(id)
    if (refStructure) {
      const system = refStructure.systemId
        ? s.systems.get(refStructure.systemId)
        : undefined
      const region = system ? s.regions.get(system.regionId) : undefined
      return {
        id,
        name: refStructure.name,
        type: 'structure' as const,
        solarSystemId: refStructure.systemId ?? undefined,
        solarSystemName: system?.name,
        regionId: system?.regionId,
        regionName: region?.name,
      }
    }

    const system = s.systems.get(id)
    if (system) {
      const region = s.regions.get(system.regionId)
      return {
        id,
        name: system.name,
        type: 'system' as const,
        solarSystemId: id,
        solarSystemName: system.name,
        regionId: system.regionId,
        regionName: region?.name,
      }
    }

    const region = s.regions.get(id)
    if (region) {
      return {
        id,
        name: region.name,
        type: 'region' as const,
        regionId: id,
        regionName: region.name,
      }
    }

    return undefined
  })
}

export function useLocationName(id: number): string {
  return useReferenceCacheStore((s) => {
    if (id >= PLAYER_STRUCTURE_ID_THRESHOLD) {
      const structure = s.structures.get(id)
      return structure?.name ?? `Structure ${id}`
    }

    const cached = s.locations.get(id)
    if (cached) return cached.name

    const station = s.stations.get(id)
    if (station) return station.name

    const refStructure = s.refStructures.get(id)
    if (refStructure) return refStructure.name

    const system = s.systems.get(id)
    if (system) return system.name

    const region = s.regions.get(id)
    if (region) return region.name

    return `Location ${id}`
  })
}

export function useReferenceDataLoaded(): boolean {
  return useReferenceCacheStore((s) => s.referenceDataLoaded)
}

export function useAllTypesLoaded(): boolean {
  return useReferenceCacheStore((s) => s.allTypesLoaded)
}

export function useUniverseDataLoaded(): boolean {
  return useReferenceCacheStore((s) => s.universeDataLoaded)
}

export function useRefStructuresLoaded(): boolean {
  return useReferenceCacheStore((s) => s.refStructuresLoaded)
}
