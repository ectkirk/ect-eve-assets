export type JumpGraph = ReadonlyMap<number, readonly number[]>

export const UNREACHABLE_JUMPS = Number.MAX_SAFE_INTEGER

export function buildJumpGraph(
  stargates: Iterable<{ from: number; to: number }>,
): JumpGraph {
  const graph = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    const neighbours = graph.get(a)
    if (neighbours) {
      if (!neighbours.includes(b)) neighbours.push(b)
    } else {
      graph.set(a, [b])
    }
  }
  for (const gate of stargates) {
    link(gate.from, gate.to)
    link(gate.to, gate.from)
  }
  return graph
}

export function computeJumpDistances(
  graph: JumpGraph,
  originSystemId: number,
): ReadonlyMap<number, number> {
  const distances = new Map<number, number>([[originSystemId, 0]])
  const queue = [originSystemId]

  for (const current of queue) {
    const nextDistance = distances.get(current)! + 1
    for (const neighbour of graph.get(current) ?? []) {
      if (distances.has(neighbour)) continue
      distances.set(neighbour, nextDistance)
      queue.push(neighbour)
    }
  }

  return distances
}
