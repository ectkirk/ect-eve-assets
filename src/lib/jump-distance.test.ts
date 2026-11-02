import { describe, it, expect } from 'vitest'
import { buildStargateAdjacency, computeJumpDistances } from './jump-distance'

// 1 - 2 - 3 - 4
//      \     /
//        5 -      6 - 7 (separate cluster)
const gates = [
  { from: 1, to: 2 },
  { from: 2, to: 3 },
  { from: 3, to: 4 },
  { from: 2, to: 5 },
  { from: 5, to: 4 },
  { from: 6, to: 7 },
  { from: 2, to: 1 },
]

describe('jump-distance', () => {
  it('builds an undirected graph without duplicate edges', () => {
    const graph = buildStargateAdjacency(gates)
    expect([...(graph.get(1) ?? [])]).toEqual([2])
    expect([...(graph.get(2) ?? [])].sort()).toEqual([1, 3, 5])
    expect([...(graph.get(7) ?? [])]).toEqual([6])
  })

  it('computes shortest jump counts from the origin', () => {
    const distances = computeJumpDistances(buildStargateAdjacency(gates), 1)
    expect(Object.fromEntries(distances)).toEqual({
      1: 0,
      2: 1,
      3: 2,
      5: 2,
      4: 3,
    })
  })

  it('leaves systems without a gate route unreachable', () => {
    const distances = computeJumpDistances(buildStargateAdjacency(gates), 1)
    expect(distances.has(6)).toBe(false)
    expect(distances.has(7)).toBe(false)
  })

  it('handles an origin with no gates', () => {
    const distances = computeJumpDistances(buildStargateAdjacency(gates), 999)
    expect(Object.fromEntries(distances)).toEqual({ 999: 0 })
  })
})
