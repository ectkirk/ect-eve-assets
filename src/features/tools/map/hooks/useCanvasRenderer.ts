import { useEffect } from 'react'
import type { Camera, ColorMode } from '../types'
import type { CachedRegion } from '@/store/reference-cache'
import type { Ansiblex } from '@/store/ansiblex-store'
import type { SpatialIndex, IndexedStargate } from '../utils/spatial-index'
import { getVisibleBounds } from '../utils/coordinates'
import {
  setupTransform,
  renderStargates,
  renderSystems,
  renderHighlightedSystem,
  renderHighlightedRegion,
  renderRoute,
  renderRouteEndpoints,
  renderAnsiblexConnections,
  renderSystemRings,
  renderSystemLabels,
  renderLabels,
} from '../utils/rendering'

const COLOR_BACKGROUND = '#000000'
const COLOR_INCURSION_RING = '#ff3333'
const COLOR_INSURGENCY_RING = '#ff8800'
import {
  calculateRegionLabels,
  calculateFactionLabels,
  calculateAllianceLabels,
} from '../utils/labels'

interface UseCanvasRendererOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  cameraRef: React.MutableRefObject<Camera>
  camera: Camera
  dimensions: { width: number; height: number }
  spatialIndex: SpatialIndex | null
  indexedStargates: IndexedStargate[]
  colorMode: ColorMode
  isInitialized: boolean
  fwData: Map<number, number> | null
  allianceData: Map<number, { allianceId: number; allianceName: string }> | null
  regionMap: Map<number, CachedRegion>
  highlightedSystemId: number | null
  highlightedRegionId: number | null
  calculatedRoute: {
    path: number[]
    jumps: number
    ansiblexJumps: number
  } | null
  routeOrigin: number | null
  routeDestination: number | null
  ansiblexes: Ansiblex[]
  useAnsiblexes: boolean
  showIncursions: boolean
  infestedSystems: Set<number>
  showInsurgencies: boolean
  insurgencySystems: Set<number>
}

export function useCanvasRenderer({
  canvasRef,
  cameraRef,
  camera,
  dimensions,
  spatialIndex,
  indexedStargates,
  colorMode,
  isInitialized,
  fwData,
  allianceData,
  regionMap,
  highlightedSystemId,
  highlightedRegionId,
  calculatedRoute,
  routeOrigin,
  routeDestination,
  ansiblexes,
  useAnsiblexes,
  showIncursions,
  infestedSystems,
  showInsurgencies,
  insurgencySystems,
}: UseCanvasRendererOptions): void {
  useEffect(() => {
    if (!spatialIndex || !canvasRef.current || !isInitialized) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cam = cameraRef.current

    ctx.fillStyle = COLOR_BACKGROUND
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)

    const visibleBounds = getVisibleBounds(
      cam,
      dimensions.width,
      dimensions.height,
    )

    const renderContext = {
      ctx,
      width: dimensions.width,
      height: dimensions.height,
      camera: cam,
      visibleBounds,
    }

    setupTransform(renderContext)

    renderStargates(renderContext, indexedStargates)

    const indexedSystems = spatialIndex.getSystems()
    renderSystems(
      renderContext,
      indexedSystems,
      colorMode,
      fwData,
      allianceData,
    )
    if (highlightedRegionId !== null) {
      renderHighlightedRegion(
        renderContext,
        highlightedRegionId,
        indexedSystems,
        indexedStargates,
      )
    }

    if (highlightedSystemId !== null) {
      const highlightedSystem = spatialIndex.getSystemById(highlightedSystemId)
      if (highlightedSystem) {
        renderHighlightedSystem(
          renderContext,
          highlightedSystem,
          indexedStargates,
        )
      }
    }

    if (ansiblexes.length > 0 && useAnsiblexes) {
      renderAnsiblexConnections(
        renderContext,
        ansiblexes,
        spatialIndex.getSystemMap(),
      )
    }

    if (showIncursions && infestedSystems.size > 0) {
      renderSystemRings(
        renderContext,
        infestedSystems,
        spatialIndex.getSystemMap(),
        COLOR_INCURSION_RING,
        8,
      )
    }

    if (showInsurgencies && insurgencySystems.size > 0) {
      renderSystemRings(
        renderContext,
        insurgencySystems,
        spatialIndex.getSystemMap(),
        COLOR_INSURGENCY_RING,
        10,
      )
    }

    const routeIds = calculatedRoute ? new Set(calculatedRoute.path) : undefined
    renderSystemLabels(
      renderContext,
      indexedSystems,
      colorMode,
      fwData,
      allianceData,
      routeIds,
    )

    let labels
    if (colorMode === 'faction' && fwData) {
      labels = calculateFactionLabels(indexedSystems, fwData)
    } else if (colorMode === 'alliance' && allianceData) {
      labels = calculateAllianceLabels(indexedSystems, allianceData)
    } else {
      labels = calculateRegionLabels(indexedSystems, regionMap)
    }
    renderLabels(renderContext, labels)

    if (calculatedRoute) {
      renderRoute(
        renderContext,
        calculatedRoute.path,
        spatialIndex.getSystemMap(),
      )
    }

    const originSystem =
      routeOrigin !== null ? spatialIndex.getSystemById(routeOrigin) : undefined
    const destSystem =
      routeDestination !== null
        ? spatialIndex.getSystemById(routeDestination)
        : undefined
    if (originSystem || destSystem) {
      renderRouteEndpoints(renderContext, originSystem, destSystem)
    }

    ctx.restore()
  }, [
    canvasRef,
    spatialIndex,
    indexedStargates,
    camera,
    cameraRef,
    dimensions,
    colorMode,
    isInitialized,
    fwData,
    allianceData,
    regionMap,
    highlightedSystemId,
    highlightedRegionId,
    calculatedRoute,
    routeOrigin,
    routeDestination,
    ansiblexes,
    useAnsiblexes,
    showIncursions,
    infestedSystems,
    showInsurgencies,
    insurgencySystems,
  ])
}
