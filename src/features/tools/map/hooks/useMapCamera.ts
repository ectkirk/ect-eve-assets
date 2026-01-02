import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import type { Camera, CoordinateData } from '../types'

interface UseMapCameraOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  dimensions: { width: number; height: number }
  coordinateData: CoordinateData
  systemsLoaded: boolean
}

interface UseMapCameraReturn {
  camera: Camera
  cameraRef: React.MutableRefObject<Camera>
  isInitialized: boolean
  isDragging: boolean
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void
  handleMouseUp: () => void
  handleMouseLeave: () => void
  navigateTo: (canvasX: number, canvasY: number, zoom: number) => void
}

const INITIAL_ZOOM = 2
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: INITIAL_ZOOM }

function computeInitialCamera(
  coordinateData: CoordinateData,
  dimensions: { width: number; height: number }
): Camera {
  const { minX, minY, maxX, maxY, scale, padding } = coordinateData
  const renderedMinX = padding
  const renderedMaxX = (maxX - minX) * scale + padding
  const renderedMinY = dimensions.height - ((maxY - minY) * scale + padding)
  const renderedMaxY = dimensions.height - padding

  const mapCenterX = (renderedMinX + renderedMaxX) / 2
  const mapCenterY = (renderedMinY + renderedMaxY) / 2

  const screenCenterX = dimensions.width / 2
  const screenCenterY = dimensions.height / 2

  return {
    x: -(mapCenterX - screenCenterX) * INITIAL_ZOOM,
    y: -(mapCenterY - screenCenterY) * INITIAL_ZOOM,
    zoom: INITIAL_ZOOM,
  }
}

export function useMapCamera({
  canvasRef,
  dimensions,
  coordinateData,
  systemsLoaded,
}: UseMapCameraOptions): UseMapCameraReturn {
  const cameraRef = useRef<Camera>(DEFAULT_CAMERA)
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const rafIdRef = useRef<number | undefined>(undefined)
  const renderRequestedRef = useRef(false)

  const targetCamera = useMemo(() => {
    if (!systemsLoaded) return null
    return computeInitialCamera(coordinateData, dimensions)
  }, [systemsLoaded, coordinateData, dimensions])

  useEffect(() => {
    if (targetCamera === null || isInitialized) return

    cameraRef.current = targetCamera

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setCamera(targetCamera)
      setIsInitialized(true)
    })

    return () => {
      cancelled = true
    }
  }, [targetCamera, isInitialized])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !isInitialized) return

    let wheelRafId: number | null = null
    let pendingZoomDelta = 0
    let lastWheelMouse = { x: 0, y: 0 }
    let isUnmounted = false

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault()
      pendingZoomDelta += e.deltaY > 0 ? -0.1 : 0.1
      lastWheelMouse = { x: e.clientX, y: e.clientY }

      if (wheelRafId !== null) return

      wheelRafId = requestAnimationFrame(() => {
        wheelRafId = null
        if (isUnmounted) return

        const canvasRect = canvas.getBoundingClientRect()
        const mouseX = lastWheelMouse.x - canvasRect.left
        const mouseY = lastWheelMouse.y - canvasRect.top

        const cam = cameraRef.current
        const newZoom = Math.max(
          0.1,
          Math.min(30, cam.zoom * (1 + pendingZoomDelta))
        )

        const worldX = (mouseX - dimensions.width / 2 - cam.x) / cam.zoom
        const worldY = (mouseY - dimensions.height / 2 - cam.y) / cam.zoom

        const newX = mouseX - dimensions.width / 2 - worldX * newZoom
        const newY = mouseY - dimensions.height / 2 - worldY * newZoom

        cameraRef.current = { x: newX, y: newY, zoom: newZoom }
        setCamera({ ...cameraRef.current })

        pendingZoomDelta = 0
      })
    }

    canvas.addEventListener('wheel', handleWheelEvent, { passive: false })

    return () => {
      isUnmounted = true
      canvas.removeEventListener('wheel', handleWheelEvent)
      if (wheelRafId !== null) {
        cancelAnimationFrame(wheelRafId)
      }
    }
  }, [canvasRef, dimensions, isInitialized])

  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX - cameraRef.current.x,
        y: e.clientY - cameraRef.current.y,
      }
    },
    []
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging) return

      cameraRef.current.x = e.clientX - dragStartRef.current.x
      cameraRef.current.y = e.clientY - dragStartRef.current.y

      if (!renderRequestedRef.current) {
        renderRequestedRef.current = true
        rafIdRef.current = requestAnimationFrame(() => {
          renderRequestedRef.current = false
          setCamera({ ...cameraRef.current })
        })
      }
    },
    [isDragging]
  )

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setCamera({ ...cameraRef.current })
    }
    setIsDragging(false)
  }, [isDragging])

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const navigateTo = useCallback(
    (canvasX: number, canvasY: number, zoom: number) => {
      const screenCenterX = dimensions.width / 2
      const screenCenterY = dimensions.height / 2
      const newCamera: Camera = {
        x: -(canvasX - screenCenterX) * zoom,
        y: -(canvasY - screenCenterY) * zoom,
        zoom,
      }
      cameraRef.current = newCamera
      setCamera(newCamera)
    },
    [dimensions]
  )

  return {
    camera,
    cameraRef,
    isInitialized,
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    navigateTo,
  }
}
