import type { CachedRegion } from '@/store/reference-cache'
import type { IndexedSystem } from './spatial-index'
import { getRegionColor, getFactionColor, getAllianceColor } from './colors'
import { FACTION_NAMES } from '../types'

export interface LabelData {
  x: number
  y: number
  topY?: number
  name: string
  color: string
}

interface CentroidAccumulator {
  sumX: number
  sumY: number
  minY: number
  count: number
  name: string
}

function accumulateCentroid(
  acc: CentroidAccumulator | undefined,
  x: number,
  y: number,
  name: string
): CentroidAccumulator {
  if (acc) {
    acc.sumX += x
    acc.sumY += y
    acc.minY = Math.min(acc.minY, y)
    acc.count += 1
    return acc
  }
  return { sumX: x, sumY: y, minY: y, count: 1, name }
}

function centroidToLabel(
  acc: CentroidAccumulator,
  color: string,
  includeTopY = false
): LabelData {
  const label: LabelData = {
    x: acc.sumX / acc.count,
    y: acc.sumY / acc.count,
    name: acc.name,
    color,
  }
  if (includeTopY) label.topY = acc.minY
  return label
}

export function calculateRegionLabels(
  systems: IndexedSystem[],
  regionMap: Map<number, CachedRegion>
): LabelData[] {
  const accumulators = new Map<number, CentroidAccumulator>()

  for (const system of systems) {
    const existing = accumulators.get(system.regionId)
    const region = regionMap.get(system.regionId)
    accumulators.set(
      system.regionId,
      accumulateCentroid(
        existing,
        system.canvasX,
        system.canvasY,
        region?.name ?? 'Unknown'
      )
    )
  }

  const labels: LabelData[] = []
  for (const [regionId, acc] of accumulators) {
    labels.push(centroidToLabel(acc, getRegionColor(regionId), true))
  }
  return labels
}

export function calculateFactionLabels(
  systems: IndexedSystem[],
  fwData: Map<number, number>
): LabelData[] {
  const accumulators = new Map<number, CentroidAccumulator>()

  for (const system of systems) {
    const factionId = fwData.get(system.id)
    if (!factionId) continue

    const existing = accumulators.get(factionId)
    accumulators.set(
      factionId,
      accumulateCentroid(
        existing,
        system.canvasX,
        system.canvasY,
        FACTION_NAMES[factionId] ?? `Faction ${factionId}`
      )
    )
  }

  const labels: LabelData[] = []
  for (const [factionId, acc] of accumulators) {
    labels.push(centroidToLabel(acc, getFactionColor(factionId)))
  }
  return labels
}

export function calculateAllianceLabels(
  systems: IndexedSystem[],
  allianceData: Map<number, { allianceId: number; allianceName: string }>
): LabelData[] {
  const allianceSystems = new Map<
    number,
    Array<{ x: number; y: number; name: string }>
  >()

  for (const system of systems) {
    const info = allianceData.get(system.id)
    if (!info) continue

    const list = allianceSystems.get(info.allianceId)
    if (list) {
      list.push({
        x: system.canvasX,
        y: system.canvasY,
        name: info.allianceName,
      })
    } else {
      allianceSystems.set(info.allianceId, [
        { x: system.canvasX, y: system.canvasY, name: info.allianceName },
      ])
    }
  }

  const labels: LabelData[] = []
  const proximityThresholdSq = 150 * 150

  for (const [allianceId, systemsList] of allianceSystems) {
    if (systemsList.length === 0) continue

    const clusters = clusterPoints(systemsList, proximityThresholdSq)
    const allianceName = systemsList[0]!.name

    for (const cluster of clusters) {
      let sumX = 0,
        sumY = 0
      for (const point of cluster) {
        sumX += point.x
        sumY += point.y
      }

      labels.push({
        x: sumX / cluster.length,
        y: sumY / cluster.length,
        name: allianceName,
        color: getAllianceColor(allianceId),
      })
    }
  }

  return labels
}

function clusterPoints(
  points: Array<{ x: number; y: number }>,
  thresholdSq: number
): Array<Array<{ x: number; y: number }>> {
  const n = points.length
  if (n === 0) return []

  const threshold = Math.sqrt(thresholdSq)
  const cellSize = threshold

  const grid = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const p = points[i]!
    const cellX = Math.floor(p.x / cellSize)
    const cellY = Math.floor(p.y / cellSize)
    const key = `${cellX},${cellY}`
    const cell = grid.get(key)
    if (cell) {
      cell.push(i)
    } else {
      grid.set(key, [i])
    }
  }

  const parent: number[] = Array.from({ length: n }, (_, i) => i)

  function find(i: number): number {
    if (parent[i] !== i) {
      parent[i] = find(parent[i]!)
    }
    return parent[i]!
  }

  function union(i: number, j: number): void {
    const pi = find(i)
    const pj = find(j)
    if (pi !== pj) {
      parent[pi] = pj
    }
  }

  for (const [key, indices] of grid) {
    const parts = key.split(',')
    const cellX = parseInt(parts[0] ?? '', 10)
    const cellY = parseInt(parts[1] ?? '', 10)
    if (Number.isNaN(cellX) || Number.isNaN(cellY)) continue

    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy <= 0) {
          for (let a = 0; a < indices.length; a++) {
            for (let b = a + 1; b < indices.length; b++) {
              const i = indices[a]!
              const j = indices[b]!
              const pi = points[i]!
              const pj = points[j]!
              const ddx = pi.x - pj.x
              const ddy = pi.y - pj.y
              if (ddx * ddx + ddy * ddy < thresholdSq) {
                union(i, j)
              }
            }
          }
          continue
        }

        const neighborKey = `${cellX + dx},${cellY + dy}`
        const neighborIndices = grid.get(neighborKey)
        if (!neighborIndices) continue

        for (const i of indices) {
          for (const j of neighborIndices) {
            const pi = points[i]!
            const pj = points[j]!
            const ddx = pi.x - pj.x
            const ddy = pi.y - pj.y
            if (ddx * ddx + ddy * ddy < thresholdSq) {
              union(i, j)
            }
          }
        }
      }
    }
  }

  const clusters = new Map<number, Array<{ x: number; y: number }>>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const point = points[i]!
    const cluster = clusters.get(root)
    if (cluster) {
      cluster.push(point)
    } else {
      clusters.set(root, [point])
    }
  }

  return Array.from(clusters.values())
}
