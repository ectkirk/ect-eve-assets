import { useEffect, useRef, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IngameActionModal } from '@/components/dialogs/IngameActionModal'
import { useCharacterLocationsStore } from '@/store/character-locations-store'
import { useIgnoredSystemsStore } from '@/store/ignored-systems-store'
import { useIncursionsStore } from '@/store/incursions-store'
import { useInsurgenciesStore } from '@/store/insurgencies-store'
import {
  startInsurgenciesRefreshTimer,
  stopInsurgenciesRefreshTimer,
} from '@/store/map-data-refresh-timers'
import type { ColorMode } from './types'
import { useMapData } from './hooks/useMapData'
import { useMapRoute } from './hooks/useMapRoute'
import { useMapInteraction } from './hooks/useMapInteraction'
import { useCanvasRenderer } from './hooks/useCanvasRenderer'
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
import { MapCharacterMarkers } from './components/MapCharacterMarkers'
import { IgnoredSystemsModal } from './components/IgnoredSystemsModal'
import { MapSystemContextMenu } from './components/MapSystemContextMenu'
import { MapInsurgencyPanel } from './components/MapInsurgencyPanel'
import { MapIncursionPanel } from './components/MapIncursionPanel'

export function StarMap() {
  const { t } = useTranslation('tools')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 })

  const [colorMode, setColorMode] = useState<ColorMode>('region')
  const [ignoredSystemsModalOpen, setIgnoredSystemsModalOpen] = useState(false)
  const [waypointAction, setWaypointAction] = useState<{
    systemId: number
    systemName: string
  } | null>(null)

  // --- Data hooks ---

  const {
    systems,
    regions,
    regionMap,
    stargates,
    coordinateData,
    spatialIndex,
    indexedStargates,
  } = useMapData(dimensions)

  const { fwData, allianceData } = useSovereigntyData(colorMode)

  const {
    ansiblexes,
    ansiblexConnectionCount,
    ansiblexRoutingEnabled,
    useAnsiblexes,
    setUseAnsiblexes,
  } = useAnsiblexRouting()

  const {
    enabled: showCharacterLocations,
    setEnabled: setShowCharacterLocations,
    locations: characterLocations,
    fetchLocations,
  } = useCharacterLocationsStore()

  const characterMarkers = useMemo(
    () => Array.from(characterLocations.values()),
    [characterLocations]
  )

  const { ignoredSystems, addIgnored, removeIgnored, isIgnored } =
    useIgnoredSystemsStore()

  const {
    enabled: showIncursions,
    setEnabled: setShowIncursions,
    infestedSystems,
    incursions: incursionsList,
    fetchIncursions,
    isSystemInIncursion,
  } = useIncursionsStore()

  const {
    enabled: showInsurgencies,
    setEnabled: setShowInsurgencies,
    affectedSystems: insurgencySystems,
    systemsInfo: insurgencySystemsInfo,
    fetchInsurgencies,
    getCorruptionLevel,
  } = useInsurgenciesStore()

  // --- Route hook ---

  const {
    routeOrigin,
    routeDestination,
    routePreference,
    calculatedRoute,
    setRouteOrigin,
    setRouteDestination,
    setRoutePreference,
    handleClearRoute,
    handleSetOrigin,
    handleSetDestination,
  } = useMapRoute({
    spatialIndex,
    stargates,
    ansiblexRoutingEnabled,
    useAnsiblexes,
    ansiblexes,
  })

  // --- Camera & search hooks ---

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
    isSystemInIncursion,
    getCorruptionLevel,
  })

  // --- Interaction hook ---

  const {
    highlightedSystemId,
    highlightedRegionId,
    contextMenu,
    setContextMenu,
    handleSelectResult,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
    handleCanvasMouseLeave,
    handleDoubleClick,
    handleContextMenu,
  } = useMapInteraction({
    canvasRef,
    cameraRef,
    spatialIndex,
    dimensions,
    isDragging,
    handleCameraMouseDown: handleMouseDown,
    handleCameraMouseMove,
    handleCameraMouseUp: handleMouseUp,
    handleCameraMouseLeave,
    handleHoverMouseMove,
    clearHover,
    selectSearchResult,
    navigateTo,
    setRouteOrigin,
    setRouteDestination,
  })

  // --- Canvas renderer ---

  useCanvasRenderer({
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
  })

  // --- Derived data for route controls ---

  const systemSearchList = useMemo<SystemSearchItem[]>(
    () =>
      systems.map((s) => ({
        id: s.id,
        name: s.name,
        security: s.securityStatus ?? 0,
      })),
    [systems]
  )

  const systemLookupMap = useMemo(
    () => new Map(systemSearchList.map((s) => [s.id, s])),
    [systemSearchList]
  )

  // --- Side effects ---

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
    return () => {
      window.removeEventListener('resize', updateDimensions)
    }
  }, [])

  useEffect(() => {
    if (!showCharacterLocations) return
    void fetchLocations()
    const interval = setInterval(() => {
      void fetchLocations()
    }, 30000)
    return () => {
      clearInterval(interval)
    }
  }, [fetchLocations, showCharacterLocations])

  useEffect(() => {
    if (!showIncursions) return
    void fetchIncursions()
    const interval = setInterval(() => {
      void fetchIncursions()
    }, 300000)
    return () => {
      clearInterval(interval)
    }
  }, [fetchIncursions, showIncursions])

  useEffect(() => {
    if (!showInsurgencies) {
      stopInsurgenciesRefreshTimer()
      return
    }
    startInsurgenciesRefreshTimer(fetchInsurgencies)
    return () => {
      stopInsurgenciesRefreshTimer()
    }
  }, [fetchInsurgencies, showInsurgencies])

  // --- Render ---

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
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      {showCharacterLocations && spatialIndex && (
        <MapCharacterMarkers
          markers={characterMarkers}
          systemMap={spatialIndex.getSystemMap()}
          camera={camera}
          width={dimensions.width}
          height={dimensions.height}
          onSystemClick={handleSetOrigin}
        />
      )}

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
        routeNotFound={
          routeOrigin !== null &&
          routeDestination !== null &&
          calculatedRoute === null
        }
        jumps={calculatedRoute?.jumps ?? null}
        ansiblexJumps={calculatedRoute?.ansiblexJumps ?? null}
        routePreference={routePreference}
        systems={systemSearchList}
        ansiblexRoutingEnabled={ansiblexRoutingEnabled}
        useAnsiblexes={useAnsiblexes}
        ansiblexCount={ansiblexConnectionCount}
        showCharacterLocations={showCharacterLocations}
        characterLocationCount={characterMarkers.length}
        showIncursions={showIncursions}
        incursionSystemCount={infestedSystems.size}
        showInsurgencies={showInsurgencies}
        insurgencySystemCount={insurgencySystemsInfo.length}
        ignoredSystemsCount={ignoredSystems.size}
        isSystemIgnored={isIgnored}
        isSystemInIncursion={isSystemInIncursion}
        getCorruptionLevel={getCorruptionLevel}
        onRoutePreferenceChange={setRoutePreference}
        onOpenIgnoredSystems={() => {
          setIgnoredSystemsModalOpen(true)
        }}
        onIgnoreSystem={addIgnored}
        onUnignoreSystem={removeIgnored}
        onUseAnsiblexesChange={setUseAnsiblexes}
        onShowCharacterLocationsChange={setShowCharacterLocations}
        onShowIncursionsChange={setShowIncursions}
        onShowInsurgenciesChange={setShowInsurgencies}
        onSetOrigin={handleSetOrigin}
        onSetDestination={handleSetDestination}
        onClear={handleClearRoute}
      />

      {contextMenu && (
        <MapSystemContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isIgnored={isIgnored(contextMenu.systemId)}
          onSetOrigin={() => {
            setRouteOrigin(contextMenu.systemId)
            setContextMenu(null)
          }}
          onSetDestination={() => {
            setRouteDestination(contextMenu.systemId)
            setContextMenu(null)
          }}
          onIgnore={() => {
            addIgnored(contextMenu.systemId)
            setContextMenu(null)
          }}
          onUnignore={() => {
            removeIgnored(contextMenu.systemId)
            setContextMenu(null)
          }}
          onSetWaypoint={() => {
            setWaypointAction({
              systemId: contextMenu.systemId,
              systemName: contextMenu.systemName,
            })
            setContextMenu(null)
          }}
          onClose={() => {
            setContextMenu(null)
          }}
        />
      )}

      <IngameActionModal
        open={waypointAction !== null}
        onOpenChange={(open) => !open && setWaypointAction(null)}
        action="autopilot"
        targetId={waypointAction?.systemId ?? 0}
        targetName={waypointAction?.systemName}
      />

      {showIncursions && incursionsList.length > 0 && (
        <MapIncursionPanel
          incursions={incursionsList}
          systemMap={systemLookupMap}
          isIgnored={isIgnored}
          onSetOrigin={handleSetOrigin}
          onSetDestination={handleSetDestination}
          onIgnore={addIgnored}
          onUnignore={removeIgnored}
        />
      )}

      {showInsurgencies && insurgencySystemsInfo.length > 0 && (
        <MapInsurgencyPanel
          systems={insurgencySystemsInfo}
          isIgnored={isIgnored}
          onSetOrigin={handleSetOrigin}
          onSetDestination={handleSetDestination}
          onIgnore={addIgnored}
          onUnignore={removeIgnored}
        />
      )}

      <IgnoredSystemsModal
        open={ignoredSystemsModalOpen}
        onOpenChange={setIgnoredSystemsModalOpen}
        systems={systemSearchList}
      />
    </div>
  )
}
