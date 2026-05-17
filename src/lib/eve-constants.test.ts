import { describe, expect, it } from 'vitest'
import { isPlayerStructureLocationId } from './eve-constants'

describe('eve constants', () => {
  it('classifies 1B-range ESI structure locations as player structures', () => {
    expect(isPlayerStructureLocationId(1_030_234_510)).toBe(true)
  })

  it('does not classify static NPC stations as player structures', () => {
    expect(isPlayerStructureLocationId(60_003_760)).toBe(false)
  })
})
