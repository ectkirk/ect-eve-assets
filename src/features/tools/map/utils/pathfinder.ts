import type { CachedStargate } from '@/store/reference-cache'
import type { Ansiblex } from '@/store/ansiblex-store'

export type RoutePreference = 'shorter' | 'safer' | 'less-secure'

export interface PathfinderGraph {
  adjacency: Map<number, Set<number>>
  security: Map<number, number>
  ansiblexEdges: Set<string>
}

export function edgeKey(from: number, to: number): string {
  return from < to ? `${from}-${to}` : `${to}-${from}`
}

export function buildGraph(
  systems: Array<{ id: number; security: number }>,
  stargates: CachedStargate[],
  ansiblexes?: Ansiblex[]
): PathfinderGraph {
  const adjacency = new Map<number, Set<number>>()
  const security = new Map<number, number>()
  const ansiblexEdges = new Set<string>()

  for (const system of systems) {
    adjacency.set(system.id, new Set())
    security.set(system.id, system.security)
  }

  for (const gate of stargates) {
    adjacency.get(gate.from)?.add(gate.to)
    adjacency.get(gate.to)?.add(gate.from)
  }

  if (ansiblexes) {
    for (const gate of ansiblexes) {
      adjacency.get(gate.fromSystemId)?.add(gate.toSystemId)
      adjacency.get(gate.toSystemId)?.add(gate.fromSystemId)
      ansiblexEdges.add(edgeKey(gate.fromSystemId, gate.toSystemId))
    }
  }

  return { adjacency, security, ansiblexEdges }
}

const LOWSEC_THRESHOLD = 0.45
const SAFE_COST = 0.9
const NULLSEC_MULTIPLIER = 2

function getCostFunction(
  preference: RoutePreference,
  securityPenalty: number,
  security: Map<number, number>
): (from: number, to: number) => number {
  const penaltyCost = Math.exp(0.15 * securityPenalty)

  switch (preference) {
    case 'shorter':
      return () => 1.0

    case 'safer':
      return (_from, to) => {
        const sec = security.get(to) ?? 0
        if (sec <= 0) return NULLSEC_MULTIPLIER * penaltyCost
        if (sec < LOWSEC_THRESHOLD) return penaltyCost
        return SAFE_COST
      }

    case 'less-secure':
      return (_from, to) => {
        const sec = security.get(to) ?? 0
        if (sec <= 0) return SAFE_COST
        if (sec < LOWSEC_THRESHOLD) return SAFE_COST
        return penaltyCost
      }
  }
}

export interface RouteResult {
  path: number[]
  jumps: number
  ansiblexJumps: number
}

class MinHeap {
  private heap: Array<{ system: number; cost: number }> = []

  push(item: { system: number; cost: number }): void {
    this.heap.push(item)
    this.bubbleUp(this.heap.length - 1)
  }

  pop(): { system: number; cost: number } | undefined {
    if (this.heap.length === 0) return undefined
    if (this.heap.length === 1) return this.heap.pop()

    const min = this.heap[0]
    this.heap[0] = this.heap.pop()!
    this.bubbleDown(0)
    return min
  }

  get length(): number {
    return this.heap.length
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this.heap[parentIndex]!.cost <= this.heap[index]!.cost) break
      this.swap(parentIndex, index)
      index = parentIndex
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length
    while (true) {
      const leftChild = 2 * index + 1
      const rightChild = 2 * index + 2
      let smallest = index

      if (
        leftChild < length &&
        this.heap[leftChild]!.cost < this.heap[smallest]!.cost
      ) {
        smallest = leftChild
      }
      if (
        rightChild < length &&
        this.heap[rightChild]!.cost < this.heap[smallest]!.cost
      ) {
        smallest = rightChild
      }

      if (smallest === index) break
      this.swap(index, smallest)
      index = smallest
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i]!
    this.heap[i] = this.heap[j]!
    this.heap[j] = temp
  }
}

export function findRoute(
  graph: PathfinderGraph,
  origin: number,
  destination: number,
  preference: RoutePreference = 'shorter',
  securityPenalty: number = 50,
  ignoredSystems?: Set<number>
): RouteResult | null {
  if (origin === destination) {
    return { path: [origin], jumps: 0, ansiblexJumps: 0 }
  }

  if (!graph.adjacency.has(origin) || !graph.adjacency.has(destination)) {
    return null
  }

  const costFn = getCostFunction(preference, securityPenalty, graph.security)

  const costs = new Map<number, number>()
  const parents = new Map<number, number | null>()
  const visited = new Set<number>()

  costs.set(origin, 0)
  parents.set(origin, null)

  const queue = new MinHeap()
  queue.push({ system: origin, cost: 0 })

  while (queue.length > 0) {
    const current = queue.pop()!

    if (visited.has(current.system)) continue
    visited.add(current.system)

    if (current.system === destination) {
      const path: number[] = []
      let node: number | null | undefined = destination
      while (node != null) {
        path.unshift(node)
        node = parents.get(node)
      }

      let ansiblexJumps = 0
      for (let i = 0; i < path.length - 1; i++) {
        if (graph.ansiblexEdges.has(edgeKey(path[i]!, path[i + 1]!))) {
          ansiblexJumps++
        }
      }

      return { path, jumps: path.length - 1, ansiblexJumps }
    }

    const neighbors = graph.adjacency.get(current.system)
    if (!neighbors) continue

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue
      if (
        ignoredSystems?.has(neighbor) &&
        neighbor !== origin &&
        neighbor !== destination
      ) {
        continue
      }

      const edgeCost = costFn(current.system, neighbor)
      const newCost = current.cost + edgeCost
      const existingCost = costs.get(neighbor)

      if (existingCost === undefined || newCost < existingCost) {
        costs.set(neighbor, newCost)
        parents.set(neighbor, current.system)
        queue.push({ system: neighbor, cost: newCost })
      }
    }
  }

  return null
}
