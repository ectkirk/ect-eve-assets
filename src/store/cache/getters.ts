import { PLAYER_STRUCTURE_ID_THRESHOLD } from '@/lib/eve-constants'
import { useReferenceCacheStore } from '.'
import type {
  CachedCategory,
  CachedGroup,
  CachedLocation,
  CachedName,
  CachedRefStructure,
  CachedRegion,
  CachedStation,
  CachedStructure,
  CachedSystem,
  CachedType,
} from './types'

export function getType(id: number): CachedType | undefined {
  return useReferenceCacheStore.getState().types.get(id)
}

export function getTypeName(id: number): string {
  return (
    useReferenceCacheStore.getState().types.get(id)?.name ??
    `Unknown Type ${id}`
  )
}

export function hasType(id: number): boolean {
  return useReferenceCacheStore.getState().types.has(id)
}

export function isTypePublished(id: number): boolean {
  const type = useReferenceCacheStore.getState().types.get(id)
  return type?.published === true
}

export function isTypeMarketable(id: number): boolean {
  const type = useReferenceCacheStore.getState().types.get(id)
  // null = explicitly not marketable, undefined = unknown (assume marketable for backwards compat)
  return type?.marketGroupId !== null
}

export function getTypeBasePrice(id: number): number | undefined {
  return useReferenceCacheStore.getState().types.get(id)?.basePrice
}

export function getTypeProductId(id: number): number | undefined {
  return useReferenceCacheStore.getState().types.get(id)?.productId
}

export function isTypeBlueprint(id: number): boolean {
  return (
    useReferenceCacheStore.getState().types.get(id)?.productId !== undefined
  )
}

export function getCategory(id: number): CachedCategory | undefined {
  return useReferenceCacheStore.getState().categories.get(id)
}

export function getGroup(id: number): CachedGroup | undefined {
  return useReferenceCacheStore.getState().groups.get(id)
}

export function isReferenceDataLoaded(): boolean {
  return useReferenceCacheStore.getState().referenceDataLoaded
}

export function isAllTypesLoaded(): boolean {
  return useReferenceCacheStore.getState().allTypesLoaded
}

export function isUniverseDataLoaded(): boolean {
  return useReferenceCacheStore.getState().universeDataLoaded
}

export function isRefStructuresLoaded(): boolean {
  return useReferenceCacheStore.getState().refStructuresLoaded
}

export function getRefStructure(id: number): CachedRefStructure | undefined {
  return useReferenceCacheStore.getState().refStructures.get(id)
}

export function hasRefStructure(id: number): boolean {
  return useReferenceCacheStore.getState().refStructures.has(id)
}

export function getRegion(id: number): CachedRegion | undefined {
  return useReferenceCacheStore.getState().regions.get(id)
}

export function getSystem(id: number): CachedSystem | undefined {
  return useReferenceCacheStore.getState().systems.get(id)
}

export function getStation(id: number): CachedStation | undefined {
  return useReferenceCacheStore.getState().stations.get(id)
}

export function hasRegion(id: number): boolean {
  return useReferenceCacheStore.getState().regions.has(id)
}

export function hasSystem(id: number): boolean {
  return useReferenceCacheStore.getState().systems.has(id)
}

export function hasStation(id: number): boolean {
  return useReferenceCacheStore.getState().stations.has(id)
}

export function getStructure(id: number): CachedStructure | undefined {
  return useReferenceCacheStore.getState().structures.get(id)
}

export function hasStructure(id: number): boolean {
  return useReferenceCacheStore.getState().structures.has(id)
}

export function getLocation(id: number): CachedLocation | undefined {
  const state = useReferenceCacheStore.getState()
  const cached = state.locations.get(id)
  if (cached) return cached

  const station = state.stations.get(id)
  if (station) {
    const system = state.systems.get(station.systemId)
    const region = system ? state.regions.get(system.regionId) : undefined
    return {
      id,
      name: station.name,
      type: 'station',
      solarSystemId: station.systemId,
      solarSystemName: system?.name,
      regionId: system?.regionId,
      regionName: region?.name,
    }
  }

  const refStructure = state.refStructures.get(id)
  if (refStructure) {
    const system = refStructure.systemId
      ? state.systems.get(refStructure.systemId)
      : undefined
    const region = system ? state.regions.get(system.regionId) : undefined
    return {
      id,
      name: refStructure.name,
      type: 'structure',
      solarSystemId: refStructure.systemId ?? undefined,
      solarSystemName: system?.name,
      regionId: system?.regionId,
      regionName: region?.name,
    }
  }

  const system = state.systems.get(id)
  if (system) {
    const region = state.regions.get(system.regionId)
    return {
      id,
      name: system.name,
      type: 'system',
      solarSystemId: id,
      solarSystemName: system.name,
      regionId: system.regionId,
      regionName: region?.name,
    }
  }

  const region = state.regions.get(id)
  if (region) {
    return {
      id,
      name: region.name,
      type: 'region',
      regionId: id,
      regionName: region.name,
    }
  }

  return undefined
}

export function hasLocation(id: number): boolean {
  const state = useReferenceCacheStore.getState()
  return (
    state.locations.has(id) ||
    state.stations.has(id) ||
    state.refStructures.has(id) ||
    state.systems.has(id) ||
    state.regions.has(id)
  )
}

export function getLocationName(id: number): string {
  const state = useReferenceCacheStore.getState()
  if (id >= PLAYER_STRUCTURE_ID_THRESHOLD) {
    const structure = state.structures.get(id)
    return structure?.name ?? `Structure ${id}`
  }
  const location = getLocation(id)
  return location?.name ?? `Location ${id}`
}

export function getName(id: number): CachedName | undefined {
  return useReferenceCacheStore.getState().names.get(id)
}

export function hasName(id: number): boolean {
  return useReferenceCacheStore.getState().names.has(id)
}

export function getAllCategories(publishedOnly = false): CachedCategory[] {
  const all = Array.from(useReferenceCacheStore.getState().categories.values())
  return publishedOnly ? all.filter((c) => c.published === true) : all
}

export function getAllGroups(publishedOnly = false): CachedGroup[] {
  const all = Array.from(useReferenceCacheStore.getState().groups.values())
  return publishedOnly ? all.filter((g) => g.published === true) : all
}

export function getGroupsByCategory(
  categoryId: number,
  publishedOnly = false
): CachedGroup[] {
  return Array.from(useReferenceCacheStore.getState().groups.values()).filter(
    (g) =>
      g.categoryId === categoryId && (!publishedOnly || g.published === true)
  )
}

export function getAllRegions(): CachedRegion[] {
  return Array.from(useReferenceCacheStore.getState().regions.values())
}
