import { useState, useCallback, useRef, useEffect } from 'react'
import {
  getStationsBySystemId,
  type CachedRegion,
} from '@/store/reference-cache'
import type { Camera, HoveredSystem } from '../types'
import type { SpatialIndex } from '../utils/spatial-index'
import { screenToWorld } from '../utils/coordinates'
import { FACTION_NAMES } from '../types'

interface UseMapHoverOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  cameraRef: React.MutableRefObject<Camera>
  spatialIndex: SpatialIndex | null
  regionMap: Map<number, CachedRegion>
  fwData: Map<number, number> | null
  allianceData: Map<number, { allianceId: number; allianceName: string }> | null
  dimensions: { width: number; height: number }
  isDragging: boolean
}

interface UseMapHoverReturn {
  hoveredSystem: HoveredSystem | null
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  clearHover: () => void
}

const THROTTLE_MS = 16

export function useMapHover({
  canvasRef,
  cameraRef,
  spatialIndex,
  regionMap,
  fwData,
  allianceData,
  dimensions,
  isDragging,
}: UseMapHoverOptions): UseMapHoverReturn {
  const [hoveredSystem, setHoveredSystem] = useState<HoveredSystem | null>(null)
  const lastHoverIdRef = useRef<number | null>(null)
  const throttleRef = useRef<number>(0)

  useEffect(() => {
    lastHoverIdRef.current = null
  }, [spatialIndex])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging || !spatialIndex || !canvasRef.current) return

      const now = performance.now()
      if (now - throttleRef.current < THROTTLE_MS) return
      throttleRef.current = now

      const rect = canvasRef.current.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      const cam = cameraRef.current
      const world = screenToWorld(
        screenX,
        screenY,
        cam,
        dimensions.width,
        dimensions.height
      )

      const hoverRadius = 10 / cam.zoom
      const nearest = spatialIndex.findNearest(world.x, world.y, hoverRadius)

      if (!nearest) {
        if (lastHoverIdRef.current !== null) {
          lastHoverIdRef.current = null
          setHoveredSystem(null)
        }
        return
      }

      if (nearest.id === lastHoverIdRef.current) return
      lastHoverIdRef.current = nearest.id

      const region = regionMap.get(nearest.regionId)
      let factionName: string | undefined
      let allianceName: string | undefined

      if (fwData) {
        const factionId = fwData.get(nearest.id)
        if (factionId) {
          factionName = FACTION_NAMES[factionId] ?? `Faction ${factionId}`
        }
      }

      if (allianceData) {
        const info = allianceData.get(nearest.id)
        if (info) {
          allianceName = info.allianceName
        }
      }

      const stations = getStationsBySystemId(nearest.id)

      setHoveredSystem({
        id: nearest.id,
        name: nearest.name,
        security: nearest.security,
        screenX,
        screenY,
        regionName: region?.name,
        factionName,
        allianceName,
        stationNames:
          stations.length > 0 ? stations.map((s) => s.name) : undefined,
      })
    },
    [
      isDragging,
      spatialIndex,
      canvasRef,
      cameraRef,
      regionMap,
      fwData,
      allianceData,
      dimensions,
    ]
  )

  const clearHover = useCallback(() => {
    lastHoverIdRef.current = null
    setHoveredSystem(null)
  }, [])

  return {
    hoveredSystem,
    handleMouseMove,
    clearHover,
  }
}
