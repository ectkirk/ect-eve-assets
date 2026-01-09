import type { Camera, ColorMode } from '../types'
import type { IndexedSystem, IndexedStargate } from './spatial-index'
import { type VisibleBounds, isInVisibleBounds } from './coordinates'
import {
  getSecurityColor,
  roundSecurity,
  getRegionColor,
  getFactionColor,
  getAllianceColor,
  parseHSL,
  hslToString,
} from './colors'
import { edgeKey } from './pathfinder'

import type { LabelData } from './labels'

export interface RenderContext {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  camera: Camera
  visibleBounds: VisibleBounds
}

export function setupTransform(rc: RenderContext): void {
  const { ctx, width, height, camera } = rc
  ctx.save()
  ctx.translate(width / 2 + camera.x, height / 2 + camera.y)
  ctx.scale(camera.zoom, camera.zoom)
  ctx.translate(-width / 2, -height / 2)
}

export function renderStargates(
  rc: RenderContext,
  stargates: IndexedStargate[]
): void {
  const { ctx, camera, visibleBounds } = rc

  ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)'
  ctx.lineWidth = 1 / camera.zoom
  ctx.beginPath()

  for (const gate of stargates) {
    if (isLineVisible(gate.x1, gate.y1, gate.x2, gate.y2, visibleBounds)) {
      ctx.moveTo(gate.x1, gate.y1)
      ctx.lineTo(gate.x2, gate.y2)
    }
  }

  ctx.stroke()
}

function isLineVisible(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bounds: VisibleBounds
): boolean {
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)

  return !(
    maxX < bounds.left ||
    minX > bounds.right ||
    maxY < bounds.top ||
    minY > bounds.bottom
  )
}

export function renderSystems(
  rc: RenderContext,
  systems: IndexedSystem[],
  colorMode: ColorMode,
  fwData: Map<number, number> | null,
  allianceData: Map<number, { allianceId: number; allianceName: string }> | null
): void {
  const { ctx, camera, visibleBounds } = rc
  const radius = 2 / camera.zoom

  for (const system of systems) {
    const { canvasX: x, canvasY: y } = system
    if (!isInVisibleBounds(x, y, visibleBounds)) continue

    ctx.fillStyle = getSystemColor(system, colorMode, fwData, allianceData)
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

const SYSTEM_LABEL_ZOOM_THRESHOLD = 6

export function renderHighlightedSystem(
  rc: RenderContext,
  system: IndexedSystem,
  stargates: IndexedStargate[]
): void {
  const { ctx, camera } = rc
  const { id, canvasX: x, canvasY: y } = system

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.lineWidth = 2 / camera.zoom
  ctx.beginPath()
  for (const gate of stargates) {
    if (gate.fromId === id || gate.toId === id) {
      ctx.moveTo(gate.x1, gate.y1)
      ctx.lineTo(gate.x2, gate.y2)
    }
  }
  ctx.stroke()

  const baseRadius = 8 / camera.zoom
  const ringWidth = 2 / camera.zoom

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = ringWidth
  ctx.beginPath()
  ctx.arc(x, y, baseRadius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.beginPath()
  ctx.arc(x, y, baseRadius + ringWidth * 2, 0, Math.PI * 2)
  ctx.stroke()
}

export function renderRoute(
  rc: RenderContext,
  path: number[],
  systemMap: Map<number, IndexedSystem>
): void {
  if (path.length < 2) return

  const { ctx, camera } = rc

  ctx.lineWidth = 3 / camera.zoom
  ctx.lineCap = 'round'

  for (let i = 0; i < path.length - 1; i++) {
    const from = systemMap.get(path[i]!)
    const to = systemMap.get(path[i + 1]!)
    if (!from || !to) continue

    const gradient = ctx.createLinearGradient(
      from.canvasX,
      from.canvasY,
      to.canvasX,
      to.canvasY
    )
    gradient.addColorStop(0, getSecurityColor(from.security))
    gradient.addColorStop(1, getSecurityColor(to.security))

    ctx.strokeStyle = gradient
    ctx.beginPath()
    ctx.moveTo(from.canvasX, from.canvasY)
    ctx.lineTo(to.canvasX, to.canvasY)
    ctx.stroke()
  }
}

function renderEndpointMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  ringRadius: number,
  ringWidth: number,
  centerRadius: number
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = ringWidth
  ctx.beginPath()
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, centerRadius, 0, Math.PI * 2)
  ctx.fill()
}

export function renderRouteEndpoints(
  rc: RenderContext,
  origin: IndexedSystem | undefined,
  destination: IndexedSystem | undefined
): void {
  const { ctx, camera } = rc
  const ringRadius = 10 / camera.zoom
  const ringWidth = 2 / camera.zoom
  const centerRadius = 4 / camera.zoom

  if (origin) {
    renderEndpointMarker(
      ctx,
      origin.canvasX,
      origin.canvasY,
      '#00ff88',
      ringRadius,
      ringWidth,
      centerRadius
    )
  }

  if (destination) {
    renderEndpointMarker(
      ctx,
      destination.canvasX,
      destination.canvasY,
      '#ff4444',
      ringRadius,
      ringWidth,
      centerRadius
    )
  }
}

export interface AnsiblexEdge {
  fromSystemId: number
  toSystemId: number
}

export function renderAnsiblexConnections(
  rc: RenderContext,
  edges: AnsiblexEdge[],
  systemMap: Map<number, IndexedSystem>
): void {
  if (edges.length === 0) return

  const { ctx, camera, visibleBounds } = rc

  const seen = new Set<string>()

  ctx.strokeStyle = '#ff8800'
  ctx.lineWidth = 2 / camera.zoom
  ctx.setLineDash([10 / camera.zoom, 5 / camera.zoom])
  ctx.beginPath()

  for (const edge of edges) {
    const key = edgeKey(edge.fromSystemId, edge.toSystemId)
    if (seen.has(key)) continue
    seen.add(key)

    const from = systemMap.get(edge.fromSystemId)
    const to = systemMap.get(edge.toSystemId)
    if (!from || !to) continue

    if (
      !isLineVisible(
        from.canvasX,
        from.canvasY,
        to.canvasX,
        to.canvasY,
        visibleBounds
      )
    ) {
      continue
    }

    ctx.moveTo(from.canvasX, from.canvasY)
    ctx.lineTo(to.canvasX, to.canvasY)
  }

  ctx.stroke()
  ctx.setLineDash([])
}

export function renderSystemRings(
  rc: RenderContext,
  systemIds: Set<number>,
  systemMap: Map<number, IndexedSystem>,
  color: string,
  baseRadius: number
): void {
  if (systemIds.size === 0) return

  const { ctx, camera, visibleBounds } = rc
  const ringRadius = baseRadius / camera.zoom
  const ringWidth = 2 / camera.zoom

  ctx.strokeStyle = color
  ctx.lineWidth = ringWidth

  for (const systemId of systemIds) {
    const system = systemMap.get(systemId)
    if (!system) continue

    const { canvasX: x, canvasY: y } = system
    if (!isInVisibleBounds(x, y, visibleBounds)) continue

    ctx.beginPath()
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

export function renderHighlightedRegion(
  rc: RenderContext,
  regionId: number,
  systems: IndexedSystem[],
  stargates: IndexedStargate[]
): void {
  const { ctx, camera } = rc

  const regionSystems: IndexedSystem[] = []
  const regionSystemIds = new Set<number>()
  for (const system of systems) {
    if (system.regionId === regionId) {
      regionSystems.push(system)
      regionSystemIds.add(system.id)
    }
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.lineWidth = 2 / camera.zoom
  ctx.beginPath()
  for (const gate of stargates) {
    if (regionSystemIds.has(gate.fromId) && regionSystemIds.has(gate.toId)) {
      ctx.moveTo(gate.x1, gate.y1)
      ctx.lineTo(gate.x2, gate.y2)
    }
  }
  ctx.stroke()

  const radius = 4 / camera.zoom
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  for (const system of regionSystems) {
    ctx.beginPath()
    ctx.arc(system.canvasX, system.canvasY, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function renderSystemLabels(
  rc: RenderContext,
  systems: IndexedSystem[],
  colorMode: ColorMode,
  fwData: Map<number, number> | null,
  allianceData: Map<
    number,
    { allianceId: number; allianceName: string }
  > | null,
  routeIds?: Set<number>
): void {
  const { ctx, camera, visibleBounds } = rc

  if (camera.zoom < SYSTEM_LABEL_ZOOM_THRESHOLD) return

  const zoomFactor = camera.zoom / SYSTEM_LABEL_ZOOM_THRESHOLD
  const screenFontSize = 8 + Math.min(zoomFactor * 2, 10)
  const fontSize = screenFontSize / camera.zoom
  const labelOffset = (screenFontSize * 0.8) / camera.zoom

  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'

  for (const system of systems) {
    const { canvasX: x, canvasY: y, name } = system
    if (!isInVisibleBounds(x, y, visibleBounds)) continue

    const isRoute = routeIds?.has(system.id)

    if (isRoute) {
      const rounded = roundSecurity(system.security)
      ctx.font = `bold ${fontSize}px Arial`
      ctx.fillStyle = getSecurityColor(system.security)

      if (rounded >= 0.85) {
        ctx.lineWidth = 3 / camera.zoom
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.strokeText(name, x, y - labelOffset)
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.9)'
        ctx.shadowBlur = 4 / camera.zoom
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.fillText(name, x, y - labelOffset)
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        continue
      }
    } else {
      ctx.font = `${fontSize}px Arial`
      ctx.fillStyle = getSystemColor(system, colorMode, fwData, allianceData)
    }

    ctx.fillText(name, x, y - labelOffset)
  }
}

function getSystemColor(
  system: IndexedSystem,
  colorMode: ColorMode,
  fwData: Map<number, number> | null,
  allianceData: Map<number, { allianceId: number; allianceName: string }> | null
): string {
  switch (colorMode) {
    case 'region':
      return getRegionColor(system.regionId)
    case 'security':
      return getSecurityColor(system.security)
    case 'faction': {
      const factionId = fwData?.get(system.id)
      return factionId ? getFactionColor(factionId) : 'hsl(0, 0%, 30%)'
    }
    case 'alliance': {
      const info = allianceData?.get(system.id)
      return info ? getAllianceColor(info.allianceId) : 'hsl(0, 0%, 30%)'
    }
  }
}

export function renderLabels(rc: RenderContext, labels: LabelData[]): void {
  const { ctx, camera } = rc

  const zoomedIn = camera.zoom >= SYSTEM_LABEL_ZOOM_THRESHOLD

  const maxScreenSize = 16
  const minScreenSize = 8
  const screenSize = zoomedIn
    ? 18
    : Math.max(minScreenSize, maxScreenSize - Math.log(camera.zoom) * 8)
  const fontSize = screenSize / camera.zoom

  ctx.font = zoomedIn
    ? `bold small-caps ${fontSize}px Arial`
    : `bold ${fontSize}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = zoomedIn ? 'bottom' : 'middle'

  const opacity = zoomedIn
    ? 1
    : camera.zoom < 5
      ? 1
      : Math.max(0.2, 1 - (camera.zoom - 5) / 10)
  const pad = Math.max(1.5, 4 / camera.zoom)
  const topOffset = 40 / camera.zoom

  for (const label of labels) {
    const labelY =
      zoomedIn && label.topY !== undefined ? label.topY - topOffset : label.y
    const metrics = ctx.measureText(label.name)

    const rectY = zoomedIn
      ? labelY - fontSize - pad
      : labelY - fontSize / 2 - pad
    ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * opacity})`
    ctx.fillRect(
      label.x - metrics.width / 2 - pad,
      rectY,
      metrics.width + pad * 2,
      fontSize + pad * 2
    )

    const hsl = parseHSL(label.color)
    ctx.fillStyle = hsl ? hslToString(hsl, opacity) : label.color
    ctx.fillText(label.name, label.x, labelY)
  }
}
