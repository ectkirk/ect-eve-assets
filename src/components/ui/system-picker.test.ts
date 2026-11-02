import { describe, it, expect } from 'vitest'
import { findSystems } from './system-picker'

const option = (id: number, name: string) => ({
  id,
  name,
  nameLower: name.toLowerCase(),
  regionName: 'Region',
})

const systems = [
  option(1, 'Amarr'),
  option(2, 'Ashab'),
  option(3, 'Jita'),
  option(4, 'Niarja'),
  option(5, 'Perimeter'),
]

describe('findSystems', () => {
  it('returns nothing for a blank query', () => {
    expect(findSystems(systems, '  ')).toEqual([])
  })

  it('ranks prefix matches before substring matches', () => {
    expect(findSystems(systems, 'a').map((s) => s.name)).toEqual([
      'Amarr',
      'Ashab',
      'Jita',
      'Niarja',
    ])
    expect(findSystems(systems, 'ja').map((s) => s.name)).toEqual(['Niarja'])
  })

  it('is case-insensitive and respects the limit', () => {
    expect(findSystems(systems, 'JI').map((s) => s.name)).toEqual(['Jita'])
    expect(findSystems(systems, 'a', 2).map((s) => s.name)).toEqual([
      'Amarr',
      'Ashab',
    ])
  })
})
