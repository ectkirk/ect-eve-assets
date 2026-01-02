import type { CachedSystem, CachedStargate } from '@/store/reference-cache'
import type { CoordinateData } from '../types'
import { worldToCanvas } from './coordinates'

export interface IndexedSystem {
  id: number
  name: string
  regionId: number
  security: number
  canvasX: number
  canvasY: number
}

export interface RegionCentroid {
  x: number
  y: number
  count: number
}

export interface IndexedStargate {
  fromId: number
  toId: number
  x1: number
  y1: number
  x2: number
  y2: number
}

export class SpatialIndex {
  private cellSize: number
  private grid: Map<string, IndexedSystem[]> = new Map()
  private allSystems: IndexedSystem[] = []
  private systemById: Map<number, IndexedSystem> = new Map()
  private regionCentroids: Map<number, RegionCentroid> = new Map()

  constructor(cellSize = 20) {
    this.cellSize = cellSize
  }

  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize)
    const cellY = Math.floor(y / this.cellSize)
    return `${cellX},${cellY}`
  }

  build(
    systems: CachedSystem[],
    coordData: CoordinateData,
    height: number
  ): void {
    this.grid.clear()
    this.allSystems = []
    this.systemById.clear()
    this.regionCentroids.clear()

    const regionAccumulators = new Map<
      number,
      { sumX: number; sumY: number; count: number }
    >()

    for (const system of systems) {
      if (!system.position2D) continue

      const { x, y } = worldToCanvas(
        system.position2D.x,
        system.position2D.y,
        coordData,
        height
      )

      const indexed: IndexedSystem = {
        id: system.id,
        name: system.name,
        regionId: system.regionId,
        security: system.securityStatus ?? 0,
        canvasX: x,
        canvasY: y,
      }

      this.allSystems.push(indexed)
      this.systemById.set(system.id, indexed)

      const key = this.getCellKey(x, y)
      const cell = this.grid.get(key)
      if (cell) {
        cell.push(indexed)
      } else {
        this.grid.set(key, [indexed])
      }

      const acc = regionAccumulators.get(system.regionId)
      if (acc) {
        acc.sumX += x
        acc.sumY += y
        acc.count += 1
      } else {
        regionAccumulators.set(system.regionId, { sumX: x, sumY: y, count: 1 })
      }
    }

    for (const [regionId, acc] of regionAccumulators) {
      this.regionCentroids.set(regionId, {
        x: acc.sumX / acc.count,
        y: acc.sumY / acc.count,
        count: acc.count,
      })
    }
  }

  findNearest(
    worldX: number,
    worldY: number,
    maxDistance: number
  ): IndexedSystem | null {
    const searchRadius = Math.ceil(maxDistance / this.cellSize)
    const centerCellX = Math.floor(worldX / this.cellSize)
    const centerCellY = Math.floor(worldY / this.cellSize)

    let nearest: IndexedSystem | null = null
    let nearestDistSq = maxDistance * maxDistance

    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        const key = `${centerCellX + dx},${centerCellY + dy}`
        const cell = this.grid.get(key)
        if (!cell) continue

        for (const system of cell) {
          const distX = worldX - system.canvasX
          const distY = worldY - system.canvasY
          const distSq = distX * distX + distY * distY

          if (distSq < nearestDistSq) {
            nearestDistSq = distSq
            nearest = system
          }
        }
      }
    }

    return nearest
  }

  getSystems(): IndexedSystem[] {
    return this.allSystems
  }

  getSystemById(id: number): IndexedSystem | undefined {
    return this.systemById.get(id)
  }

  getSystemMap(): Map<number, IndexedSystem> {
    return this.systemById
  }

  getRegionCentroid(regionId: number): RegionCentroid | undefined {
    return this.regionCentroids.get(regionId)
  }

  indexStargates(stargates: CachedStargate[]): IndexedStargate[] {
    const result: IndexedStargate[] = []
    for (const gate of stargates) {
      const from = this.systemById.get(gate.from)
      const to = this.systemById.get(gate.to)
      if (from && to) {
        result.push({
          fromId: gate.from,
          toId: gate.to,
          x1: from.canvasX,
          y1: from.canvasY,
          x2: to.canvasX,
          y2: to.canvasY,
        })
      }
    }
    return result
  }
}
