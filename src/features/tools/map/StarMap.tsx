import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getAllSystems,
  getAllRegions,
  getAllStargates,
  useUniverseDataLoaded,
  type CachedSystem,
  type CachedRegion,
  type CachedStargate,
} from '@/store/reference-cache'
import type { ColorMode, SearchResult } from './types'
import {
  buildGraph,
  findRoute,
  type RoutePreference,
  type PathfinderGraph,
} from './utils/pathfinder'
import {
  calculateBounds,
  calculateCoordinateData,
  getVisibleBounds,
  screenToWorld,
} from './utils/coordinates'
import { SpatialIndex } from './utils/spatial-index'
import {
  setupTransform,
  renderStargates,
  renderSystems,
  renderHighlightedSystem,
  renderHighlightedRegion,
  renderRoute,
  renderRouteEndpoints,
  renderAnsiblexConnections,
  renderSystemLabels,
  renderLabels,
} from './utils/rendering'
import {
  calculateRegionLabels,
  calculateFactionLabels,
  calculateAllianceLabels,
} from './utils/labels'
import { useMapCamera } from './hooks/useMapCamera'
import { useMapSearch } from './hooks/useMapSearch'
import { useMapHover } from './hooks/useMapHover'
import { useSovereigntyData } from './hooks/useSovereigntyData'
import { useAnsiblexRouting } from './hooks/useAnsiblexRouting'
import { MapTooltip } from './components/MapTooltip'
import { MapControls } from './components/MapControls'
import {
  MapRouteControls,
  type SystemSearchItem,
} from './components/MapRouteControls'
import { MapSearch } from './components/MapSearch'

export function StarMap() {
  const { t } = useTranslation('tools')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 })

  const [colorMode, setColorMode] = useState<ColorMode>('region')
  const [highlightedSystemId, setHighlightedSystemId] = useState<number | null>(
    null
  )
  const [highlightedRegionId, setHighlightedRegionId] = useState<number | null>(
    null
  )
  const [routeOrigin, setRouteOrigin] = useState<number | null>(null)
  const [routeDestination, setRouteDestination] = useState<number | null>(null)
  const [routePreference, setRoutePreference] =
    useState<RoutePreference>('shorter')
  const clickStartRef = useRef<{ x: number; y: number } | null>(null)

  const universeDataLoaded = useUniverseDataLoaded()
  const { fwData, allianceData } = useSovereigntyData(colorMode)

  const {
    ansiblexes,
    ansiblexConnectionCount,
    ansiblexRoutingEnabled,
    useAnsiblexes,
    setUseAnsiblexes,
  } = useAnsiblexRouting()

  const { systems, regions, stargates } = useMemo(() => {
    if (!universeDataLoaded) {
      return {
        systems: [] as CachedSystem[],
        regions: [] as CachedRegion[],
        stargates: [] as CachedStargate[],
      }
    }
    return {
      systems: getAllSystems(),
      regions: getAllRegions(),
      stargates: getAllStargates(),
    }
  }, [universeDataLoaded])

  const regionMap = useMemo(
    () => new Map(regions.map((r) => [r.id, r])),
    [regions]
  )

  const bounds = useMemo(() => calculateBounds(systems), [systems])

  const coordinateData = useMemo(
    () => calculateCoordinateData(bounds, dimensions.width, dimensions.height),
    [bounds, dimensions]
  )

  const spatialIndex = useMemo(() => {
    if (systems.length === 0) return null
    const index = new SpatialIndex(20)
    index.build(systems, coordinateData, dimensions.height)
    return index
  }, [systems, coordinateData, dimensions.height])

  const indexedStargates = useMemo(
    () => spatialIndex?.indexStargates(stargates) ?? [],
    [spatialIndex, stargates]
  )

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

  const calculatedRoute = useMemo(() => {
    if (!pathfinderGraph || routeOrigin === null || routeDestination === null) {
      return null
    }
    return findRoute(
      pathfinderGraph,
      routeOrigin,
      routeDestination,
      routePreference
    )
  }, [pathfinderGraph, routeOrigin, routeDestination, routePreference])

  const {
    camera,
    cameraRef,
    isInitialized,
    isDragging,
    handleMouseDown,
    handleMouseMove: handleCameraMouseMove,
    handleMouseUp,
    handleMouseLeave: handleCameraMouseLeave,
    navigateTo,
  } = useMapCamera({
    canvasRef,
    dimensions,
    coordinateData,
    systemsLoaded: systems.length > 0,
  })

  const {
    query: searchQuery,
    results: searchResults,
    showAutocomplete,
    handleChange: handleSearchChange,
    handleFocus: handleSearchFocus,
    handleBlur: handleSearchBlur,
    selectResult: selectSearchResult,
  } = useMapSearch({ systems, regions })

  const {
    hoveredSystem,
    handleMouseMove: handleHoverMouseMove,
    clearHover,
  } = useMapHover({
    canvasRef,
    cameraRef,
    spatialIndex,
    regionMap,
    fwData,
    allianceData,
    dimensions,
    isDragging,
  })

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      selectSearchResult(result)

      if (result.type === 'system') {
        setHighlightedRegionId(null)
        setHighlightedSystemId(result.id)
        const indexed = spatialIndex?.getSystemById(result.id)
        if (indexed) {
          navigateTo(indexed.canvasX, indexed.canvasY, 8)
        }
      } else {
        setHighlightedSystemId(null)
        setHighlightedRegionId(result.id)
        const centroid = spatialIndex?.getRegionCentroid(result.id)
        if (centroid) {
          navigateTo(centroid.x, centroid.y, 4)
        }
      }
    },
    [selectSearchResult, spatialIndex, navigateTo]
  )

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      clickStartRef.current = { x: e.clientX, y: e.clientY }
      handleMouseDown(e)
    },
    [handleMouseDown]
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      handleCameraMouseMove(e)
      if (!isDragging) {
        handleHoverMouseMove(e)
      }
    },
    [handleCameraMouseMove, handleHoverMouseMove, isDragging]
  )

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      handleMouseUp()

      if (!clickStartRef.current || !spatialIndex || !canvasRef.current) return

      const dx = e.clientX - clickStartRef.current.x
      const dy = e.clientY - clickStartRef.current.y
      const movedDistance = Math.sqrt(dx * dx + dy * dy)

      if (movedDistance < 5) {
        const rect = canvasRef.current.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const cam = cameraRef.current
        const { x: worldX, y: worldY } = screenToWorld(
          mouseX,
          mouseY,
          cam,
          dimensions.width,
          dimensions.height
        )

        const clickRadius = 15 / cam.zoom
        const nearest = spatialIndex.findNearest(worldX, worldY, clickRadius)

        if (e.shiftKey && nearest) {
          setRouteOrigin(nearest.id)
        } else if (e.ctrlKey && nearest) {
          setRouteDestination(nearest.id)
        } else if (nearest) {
          setHighlightedRegionId(null)
          setHighlightedSystemId(nearest.id)
        } else {
          const regionRadius = 100 / cam.zoom
          const nearestForRegion = spatialIndex.findNearest(
            worldX,
            worldY,
            regionRadius
          )
          setHighlightedSystemId(null)
          setHighlightedRegionId(nearestForRegion?.regionId ?? null)
        }
      }

      clickStartRef.current = null
    },
    [handleMouseUp, spatialIndex, cameraRef, dimensions]
  )

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

  const systemSearchList = useMemo<SystemSearchItem[]>(
    () =>
      systems.map((s) => ({
        id: s.id,
        name: s.name,
        security: s.securityStatus ?? 0,
      })),
    [systems]
  )

  const handleCanvasMouseLeave = useCallback(() => {
    handleCameraMouseLeave()
    clearHover()
    clickStartRef.current = null
  }, [handleCameraMouseLeave, clearHover])

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    if (!spatialIndex || !canvasRef.current || !isInitialized) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cam = cameraRef.current

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)

    const visibleBounds = getVisibleBounds(
      cam,
      dimensions.width,
      dimensions.height
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
      allianceData
    )
    if (highlightedRegionId !== null) {
      renderHighlightedRegion(
        renderContext,
        highlightedRegionId,
        indexedSystems,
        indexedStargates
      )
    }

    if (highlightedSystemId !== null) {
      const highlightedSystem = spatialIndex.getSystemById(highlightedSystemId)
      if (highlightedSystem) {
        renderHighlightedSystem(
          renderContext,
          highlightedSystem,
          indexedStargates
        )
      }
    }

    if (calculatedRoute) {
      renderRoute(
        renderContext,
        calculatedRoute.path,
        spatialIndex.getSystemMap()
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

    if (ansiblexes.length > 0 && useAnsiblexes) {
      renderAnsiblexConnections(
        renderContext,
        ansiblexes,
        spatialIndex.getSystemMap()
      )
    }

    const routeIds = calculatedRoute ? new Set(calculatedRoute.path) : undefined
    renderSystemLabels(
      renderContext,
      indexedSystems,
      colorMode,
      fwData,
      allianceData,
      routeIds
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

    ctx.restore()
  }, [
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
  ])

  if (systems.length === 0 || !isInitialized) {
    return (
      <div
        ref={containerRef}
        className="flex h-full w-full items-center justify-center"
      >
        <p className="text-content-secondary">{t('map.loadingMapData')}</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="block cursor-move"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseLeave}
      />

      {hoveredSystem && (
        <MapTooltip
          system={hoveredSystem}
          containerWidth={dimensions.width}
          containerHeight={dimensions.height}
        />
      )}

      <MapSearch
        query={searchQuery}
        results={searchResults}
        showAutocomplete={showAutocomplete}
        onChange={handleSearchChange}
        onFocus={handleSearchFocus}
        onBlur={handleSearchBlur}
        onSelectResult={handleSelectResult}
      />

      <MapControls colorMode={colorMode} onColorModeChange={setColorMode} />

      <MapRouteControls
        originName={
          routeOrigin !== null
            ? (spatialIndex?.getSystemById(routeOrigin)?.name ?? null)
            : null
        }
        originSecurity={
          routeOrigin !== null
            ? (spatialIndex?.getSystemById(routeOrigin)?.security ?? null)
            : null
        }
        destinationName={
          routeDestination !== null
            ? (spatialIndex?.getSystemById(routeDestination)?.name ?? null)
            : null
        }
        destinationSecurity={
          routeDestination !== null
            ? (spatialIndex?.getSystemById(routeDestination)?.security ?? null)
            : null
        }
        routeSystems={
          calculatedRoute && spatialIndex
            ? calculatedRoute.path
                .map((id) => {
                  const sys = spatialIndex.getSystemById(id)
                  return sys
                    ? { id: sys.id, name: sys.name, security: sys.security }
                    : null
                })
                .filter((s): s is NonNullable<typeof s> => s !== null)
            : []
        }
        jumps={calculatedRoute?.jumps ?? null}
        ansiblexJumps={calculatedRoute?.ansiblexJumps ?? null}
        routePreference={routePreference}
        systems={systemSearchList}
        ansiblexRoutingEnabled={ansiblexRoutingEnabled}
        useAnsiblexes={useAnsiblexes}
        ansiblexCount={ansiblexConnectionCount}
        onRoutePreferenceChange={setRoutePreference}
        onUseAnsiblexesChange={setUseAnsiblexes}
        onSetOrigin={handleSetOrigin}
        onSetDestination={handleSetDestination}
        onClear={handleClearRoute}
      />
    </div>
  )
}
