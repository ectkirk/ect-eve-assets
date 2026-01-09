import type { CachedSystem } from '@/store/reference-cache'
import type { Bounds, Camera, CoordinateData } from '../types'

export function calculateBounds(systems: CachedSystem[]): Bounds {
  if (systems.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity

  for (const system of systems) {
    if (!system.position2D) continue
    const { x, y } = system.position2D
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  return { minX, minY, maxX, maxY }
}

export function calculateCoordinateData(
  bounds: Bounds,
  width: number,
  height: number,
  padding = 50
): CoordinateData {
  const scaleX = (width - padding * 2) / (bounds.maxX - bounds.minX || 1)
  const scaleY = (height - padding * 2) / (bounds.maxY - bounds.minY || 1)
  const scale = Math.min(scaleX, scaleY)
  return { ...bounds, scale, padding }
}

export function worldToCanvas(
  worldX: number,
  worldY: number,
  coordData: CoordinateData,
  height: number
): { x: number; y: number } {
  return {
    x: (worldX - coordData.minX) * coordData.scale + coordData.padding,
    y:
      height -
      ((worldY - coordData.minY) * coordData.scale + coordData.padding),
  }
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: Camera,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: (screenX - width / 2 - camera.x) / camera.zoom + width / 2,
    y: (screenY - height / 2 - camera.y) / camera.zoom + height / 2,
  }
}

export function canvasToScreen(
  canvasX: number,
  canvasY: number,
  camera: Camera,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: (canvasX - width / 2) * camera.zoom + width / 2 + camera.x,
    y: (canvasY - height / 2) * camera.zoom + height / 2 + camera.y,
  }
}

export interface VisibleBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export function getVisibleBounds(
  camera: Camera,
  width: number,
  height: number,
  margin = 50
): VisibleBounds {
  const invZoom = 1 / camera.zoom
  const centerX = width / 2
  const centerY = height / 2

  const halfWidth = (width / 2 + margin) * invZoom
  const halfHeight = (height / 2 + margin) * invZoom

  const worldCenterX = centerX - camera.x * invZoom
  const worldCenterY = centerY - camera.y * invZoom

  return {
    left: worldCenterX - halfWidth,
    right: worldCenterX + halfWidth,
    top: worldCenterY - halfHeight,
    bottom: worldCenterY + halfHeight,
  }
}

export function isInVisibleBounds(
  x: number,
  y: number,
  bounds: VisibleBounds
): boolean {
  return (
    x >= bounds.left &&
    x <= bounds.right &&
    y >= bounds.top &&
    y <= bounds.bottom
  )
}
