import { useState, useCallback, useRef, useEffect } from 'react'
import type { Camera, SearchResult } from '../types'
import { CLICK_RADIUS } from '../types'
import { screenToWorld } from '../utils/coordinates'
import type { SpatialIndex } from '../utils/spatial-index'

interface UseMapInteractionOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  cameraRef: React.MutableRefObject<Camera>
  spatialIndex: SpatialIndex | null
  dimensions: { width: number; height: number }
  isDragging: boolean
  handleCameraMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleCameraMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleCameraMouseUp: () => void
  handleCameraMouseLeave: () => void
  handleHoverMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  clearHover: () => void
  selectSearchResult: (result: SearchResult) => void
  navigateTo: (canvasX: number, canvasY: number, zoom: number) => void
  setRouteOrigin: (id: number | null) => void
  setRouteDestination: (id: number | null) => void
}

interface ContextMenuState {
  x: number
  y: number
  systemId: number
  systemName: string
}

interface UseMapInteractionReturn {
  highlightedSystemId: number | null
  highlightedRegionId: number | null
  contextMenu: ContextMenuState | null
  setContextMenu: (menu: ContextMenuState | null) => void
  handleSelectResult: (result: SearchResult) => void
  handleCanvasMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleCanvasMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleCanvasMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleCanvasMouseLeave: () => void
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void
}

export function useMapInteraction({
  canvasRef,
  cameraRef,
  spatialIndex,
  dimensions,
  isDragging,
  handleCameraMouseDown,
  handleCameraMouseMove,
  handleCameraMouseUp,
  handleCameraMouseLeave,
  handleHoverMouseMove,
  clearHover,
  selectSearchResult,
  navigateTo,
  setRouteOrigin,
  setRouteDestination,
}: UseMapInteractionOptions): UseMapInteractionReturn {
  const [highlightedSystemId, setHighlightedSystemId] = useState<number | null>(
    null,
  )
  const [highlightedRegionId, setHighlightedRegionId] = useState<number | null>(
    null,
  )
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const clickStartRef = useRef<{ x: number; y: number } | null>(null)

  const getWorldCoordsFromEvent = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return null
      const rect = canvasRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const cam = cameraRef.current
      return screenToWorld(
        mouseX,
        mouseY,
        cam,
        dimensions.width,
        dimensions.height,
      )
    },
    [canvasRef, cameraRef, dimensions],
  )

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
    [selectSearchResult, spatialIndex, navigateTo],
  )

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      clickStartRef.current = { x: e.clientX, y: e.clientY }
      handleCameraMouseDown(e)
    },
    [handleCameraMouseDown],
  )

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      handleCameraMouseMove(e)
      if (!isDragging) {
        handleHoverMouseMove(e)
      }
    },
    [handleCameraMouseMove, handleHoverMouseMove, isDragging],
  )

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      handleCameraMouseUp()

      if (!clickStartRef.current || !spatialIndex || !canvasRef.current) return

      const dx = e.clientX - clickStartRef.current.x
      const dy = e.clientY - clickStartRef.current.y
      const movedDistance = Math.sqrt(dx * dx + dy * dy)

      if (movedDistance < 5) {
        const coords = getWorldCoordsFromEvent(e)
        if (!coords) return

        const clickRadius = CLICK_RADIUS / cameraRef.current.zoom
        const nearest = spatialIndex.findNearest(
          coords.x,
          coords.y,
          clickRadius,
        )

        if (e.shiftKey && nearest) {
          setRouteOrigin(nearest.id)
        } else if (e.ctrlKey && nearest) {
          setRouteDestination(nearest.id)
        } else if (nearest) {
          setHighlightedRegionId(null)
          setHighlightedSystemId(nearest.id)
        } else {
          setHighlightedSystemId(null)
          setHighlightedRegionId(null)
        }
      }

      clickStartRef.current = null
    },
    [
      handleCameraMouseUp,
      spatialIndex,
      canvasRef,
      getWorldCoordsFromEvent,
      cameraRef,
      setRouteOrigin,
      setRouteDestination,
    ],
  )

  const handleCanvasMouseLeave = useCallback(() => {
    handleCameraMouseLeave()
    clearHover()
    clickStartRef.current = null
  }, [handleCameraMouseLeave, clearHover])

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!spatialIndex) return

      const coords = getWorldCoordsFromEvent(e)
      if (!coords) return

      const regionRadius = 100 / cameraRef.current.zoom
      const nearest = spatialIndex.findNearest(coords.x, coords.y, regionRadius)

      if (nearest) {
        setHighlightedSystemId(null)
        setHighlightedRegionId(nearest.regionId)
      }
    },
    [spatialIndex, getWorldCoordsFromEvent, cameraRef],
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (!spatialIndex) return

      const coords = getWorldCoordsFromEvent(e)
      if (!coords) return

      const clickRadius = CLICK_RADIUS / cameraRef.current.zoom
      const nearest = spatialIndex.findNearest(coords.x, coords.y, clickRadius)

      if (nearest) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          systemId: nearest.id,
          systemName: nearest.name,
        })
      }
    },
    [spatialIndex, getWorldCoordsFromEvent, cameraRef],
  )

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => {
      setContextMenu(null)
    }
    window.addEventListener('click', handler)
    return () => {
      window.removeEventListener('click', handler)
    }
  }, [contextMenu])

  return {
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
  }
}
