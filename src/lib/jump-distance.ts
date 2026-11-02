export type StargateAdjacency = Map<number, Set<number>>

export function buildStargateAdjacency(
  stargates: Iterable<{ from: number; to: number }>,
): StargateAdjacency {
  const adjacency: StargateAdjacency = new Map()
  const link = (a: number, b: number) => {
    const neighbours = adjacency.get(a)
    if (neighbours) neighbours.add(b)
    else adjacency.set(a, new Set([b]))
  }
  for (const gate of stargates) {
    link(gate.from, gate.to)
    link(gate.to, gate.from)
  }
  return adjacency
}

export function computeJumpDistances(
  adjacency: ReadonlyMap<number, ReadonlySet<number>>,
  originSystemId: number,
): ReadonlyMap<number, number> {
  const distances = new Map<number, number>([[originSystemId, 0]])
  const queue = [originSystemId]

  for (const current of queue) {
    const nextDistance = distances.get(current)! + 1
    for (const neighbour of adjacency.get(current) ?? []) {
      if (distances.has(neighbour)) continue
      distances.set(neighbour, nextDistance)
      queue.push(neighbour)
    }
  }

  return distances
}
