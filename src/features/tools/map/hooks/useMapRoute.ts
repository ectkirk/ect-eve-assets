import { useState, useMemo, useCallback } from 'react'
import { useIgnoredSystemsStore } from '@/store/ignored-systems-store'
import { useIncursionsStore } from '@/store/incursions-store'
import { useInsurgenciesStore } from '@/store/insurgencies-store'
import type { CachedStargate } from '@/store/reference-cache'
import {
  buildGraph,
  findRoute,
  type RoutePreference,
  type PathfinderGraph,
} from '../utils/pathfinder'
import type { SpatialIndex } from '../utils/spatial-index'
import type { Ansiblex } from '@/store/ansiblex-store'

interface UseMapRouteOptions {
  spatialIndex: SpatialIndex | null
  stargates: CachedStargate[]
  ansiblexRoutingEnabled: boolean
  useAnsiblexes: boolean
  ansiblexes: Ansiblex[]
}

interface UseMapRouteReturn {
  routeOrigin: number | null
  routeDestination: number | null
  routePreference: RoutePreference
  calculatedRoute: ReturnType<typeof findRoute>
  effectiveIgnoredSystems: Set<number>
  pathfinderGraph: PathfinderGraph | null
  setRouteOrigin: (id: number | null) => void
  setRouteDestination: (id: number | null) => void
  setRoutePreference: (pref: RoutePreference) => void
  handleClearRoute: () => void
  handleSetOrigin: (systemId: number) => void
  handleSetDestination: (systemId: number) => void
}

export function useMapRoute({
  spatialIndex,
  stargates,
  ansiblexRoutingEnabled,
  useAnsiblexes,
  ansiblexes,
}: UseMapRouteOptions): UseMapRouteReturn {
  const [routeOrigin, setRouteOrigin] = useState<number | null>(null)
  const [routeDestination, setRouteDestination] = useState<number | null>(null)
  const [routePreference, setRoutePreference] =
    useState<RoutePreference>('shorter')

  const { ignoredSystems, avoidIncursions, avoidInsurgencies } =
    useIgnoredSystemsStore()

  const { infestedSystems } = useIncursionsStore()
  const { affectedSystems: insurgencySystems } = useInsurgenciesStore()

  const pathfinderGraph = useMemo<PathfinderGraph | null>(() => {
    if (!spatialIndex || stargates.length === 0) return null
    const indexedSystems = spatialIndex.getSystems()
    const gatesForRouting =
      ansiblexRoutingEnabled && useAnsiblexes ? ansiblexes : undefined
    return buildGraph(indexedSystems, stargates, gatesForRouting)
  }, [
    spatialIndex,
    stargates,
    ansiblexRoutingEnabled,
    useAnsiblexes,
    ansiblexes,
  ])

  const effectiveIgnoredSystems = useMemo(() => {
    const merged = new Set(ignoredSystems)
    if (avoidIncursions) {
      for (const id of infestedSystems) merged.add(id)
    }
    if (avoidInsurgencies) {
      for (const id of insurgencySystems) merged.add(id)
    }
    return merged
  }, [
    ignoredSystems,
    avoidIncursions,
    avoidInsurgencies,
    infestedSystems,
    insurgencySystems,
  ])

  const calculatedRoute = useMemo(() => {
    if (!pathfinderGraph || routeOrigin === null || routeDestination === null) {
      return null
    }
    return findRoute(
      pathfinderGraph,
      routeOrigin,
      routeDestination,
      routePreference,
      50,
      effectiveIgnoredSystems,
    )
  }, [
    pathfinderGraph,
    routeOrigin,
    routeDestination,
    routePreference,
    effectiveIgnoredSystems,
  ])

  const handleClearRoute = useCallback(() => {
    setRouteOrigin(null)
    setRouteDestination(null)
  }, [])

  const handleSetOrigin = useCallback((systemId: number) => {
    setRouteOrigin(systemId)
  }, [])

  const handleSetDestination = useCallback((systemId: number) => {
    setRouteDestination(systemId)
  }, [])

  return {
    routeOrigin,
    routeDestination,
    routePreference,
    calculatedRoute,
    effectiveIgnoredSystems,
    pathfinderGraph,
    setRouteOrigin,
    setRouteDestination,
    setRoutePreference,
    handleClearRoute,
    handleSetOrigin,
    handleSetDestination,
  }
}
