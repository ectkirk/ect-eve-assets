import { useMemo } from 'react'
import {
  getAllSystems,
  getAllRegions,
  getAllStargates,
  useUniverseDataLoaded,
  type CachedSystem,
  type CachedRegion,
  type CachedStargate,
} from '@/store/reference-cache'
import { EXCLUDED_REGION_NAMES } from '../types'
import { calculateBounds, calculateCoordinateData } from '../utils/coordinates'
import { SpatialIndex } from '../utils/spatial-index'
import type { IndexedStargate } from '../utils/spatial-index'

interface UseMapDataReturn {
  universeDataLoaded: boolean
  systems: CachedSystem[]
  regions: CachedRegion[]
  stargates: CachedStargate[]
  regionMap: Map<number, CachedRegion>
  coordinateData: ReturnType<typeof calculateCoordinateData>
  spatialIndex: SpatialIndex | null
  indexedStargates: IndexedStargate[]
}

export function useMapData(dimensions: {
  width: number
  height: number
}): UseMapDataReturn {
  const universeDataLoaded = useUniverseDataLoaded()

  const { systems, regions, stargates } = useMemo(() => {
    if (!universeDataLoaded) {
      return {
        systems: [] as CachedSystem[],
        regions: [] as CachedRegion[],
        stargates: [] as CachedStargate[],
      }
    }

    const allRegions = getAllRegions()
    const filteredRegions = allRegions.filter(
      (r) => !EXCLUDED_REGION_NAMES.has(r.name),
    )
    const excludedRegionIds = new Set(
      allRegions
        .filter((r) => EXCLUDED_REGION_NAMES.has(r.name))
        .map((r) => r.id),
    )

    const filteredSystems = getAllSystems().filter(
      (s) => !excludedRegionIds.has(s.regionId),
    )
    const validSystemIds = new Set(filteredSystems.map((s) => s.id))

    const filteredStargates = getAllStargates().filter(
      (g) => validSystemIds.has(g.from) && validSystemIds.has(g.to),
    )

    return {
      systems: filteredSystems,
      regions: filteredRegions,
      stargates: filteredStargates,
    }
  }, [universeDataLoaded])

  const regionMap = useMemo(
    () => new Map(regions.map((r) => [r.id, r])),
    [regions],
  )

  const bounds = useMemo(() => calculateBounds(systems), [systems])

  const coordinateData = useMemo(
    () => calculateCoordinateData(bounds, dimensions.width, dimensions.height),
    [bounds, dimensions],
  )

  const spatialIndex = useMemo(() => {
    if (systems.length === 0) return null
    const index = new SpatialIndex(20)
    index.build(systems, coordinateData, dimensions.height)
    return index
  }, [systems, coordinateData, dimensions.height])

  const indexedStargates = useMemo(
    () => spatialIndex?.indexStargates(stargates) ?? [],
    [spatialIndex, stargates],
  )

  return {
    universeDataLoaded,
    systems,
    regions,
    stargates,
    regionMap,
    coordinateData,
    spatialIndex,
    indexedStargates,
  }
}
