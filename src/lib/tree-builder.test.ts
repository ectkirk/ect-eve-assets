import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildTree, flattenTree, getAllNodeIds, filterTree, type AssetWithOwner } from './tree-builder'
import { TreeMode } from './tree-types'
import type { ESIAsset } from '@/api/endpoints/assets'
import type { Owner } from '@/store/auth-store'

vi.mock('@/store/reference-cache', () => ({
  getType: vi.fn((id: number) => {
    const types: Record<number, { id: number; name: string; categoryId: number; categoryName: string; groupId: number; groupName: string; volume: number }> = {
      34: { id: 34, name: 'Tritanium', categoryId: 4, categoryName: 'Material', groupId: 18, groupName: 'Mineral', volume: 0.01 },
      35: { id: 35, name: 'Pyerite', categoryId: 4, categoryName: 'Material', groupId: 18, groupName: 'Mineral', volume: 0.01 },
      587: { id: 587, name: 'Rifter', categoryId: 6, categoryName: 'Ship', groupId: 25, groupName: 'Frigate', volume: 27289 },
      17366: { id: 17366, name: 'Station Container', categoryId: 2, categoryName: 'Celestial', groupId: 448, groupName: 'Audit Log Secure Container', volume: 10000 },
      27: { id: 27, name: 'Office', categoryId: 2, categoryName: 'Celestial', groupId: 16, groupName: 'Station Services', volume: 0 },
      35832: { id: 35832, name: 'Astrahus', categoryId: 65, categoryName: 'Structure', groupId: 1657, groupName: 'Citadel', volume: 8000 },
    }
    return types[id]
  }),
  getStructure: vi.fn((id: number) => {
    if (id === 1000000000001) {
      return { id: 1000000000001, name: 'Test Citadel', solarSystemId: 30000142, typeId: 35832, ownerId: 123 }
    }
    return undefined
  }),
  getLocation: vi.fn((id: number) => {
    const locations: Record<number, { id: number; name: string; type: string; solarSystemId?: number; solarSystemName?: string; regionId?: number; regionName?: string }> = {
      60003760: { id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', type: 'station', solarSystemId: 30000142, solarSystemName: 'Jita', regionId: 10000002, regionName: 'The Forge' },
      30000142: { id: 30000142, name: 'Jita', type: 'system', regionId: 10000002, regionName: 'The Forge' },
      10000002: { id: 10000002, name: 'The Forge', type: 'region' },
    }
    return locations[id]
  }),
  getAbyssalPrice: vi.fn(() => undefined),
  CategoryIds: {
    SHIP: 6,
    MODULE: 7,
    CHARGE: 8,
    BLUEPRINT: 9,
    SKILL: 16,
    DRONE: 18,
    IMPLANT: 20,
    STRUCTURE: 65,
    SKIN: 91,
  },
}))

vi.mock('@/store/blueprints-store', () => ({
  formatBlueprintName: vi.fn((baseName: string) => baseName),
}))

const testOwner: Owner = {
  id: 12345,
  characterId: 12345,
  corporationId: 98000001,
  name: 'Test Character',
  type: 'character',
  accessToken: null,
  refreshToken: 'test-refresh',
  expiresAt: null,
}

function createAsset(overrides: Partial<ESIAsset> = {}): ESIAsset {
  return {
    item_id: Math.floor(Math.random() * 1000000),
    type_id: 34,
    location_id: 60003760,
    location_type: 'station',
    location_flag: 'Hangar',
    quantity: 1,
    is_singleton: false,
    ...overrides,
  }
}

function createAssetWithOwner(asset: ESIAsset, owner: Owner = testOwner): AssetWithOwner {
  return { asset, owner }
}

describe('buildTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basic tree structure', () => {
    it('creates flat station hierarchy with region in name', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, quantity: 100 })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map([[34, 5]]),
      })

      expect(tree).toHaveLength(1)
      expect(tree[0]!.nodeType).toBe('station')
      expect(tree[0]!.name).toContain('Jita')
      expect(tree[0]!.regionName).toBe('The Forge')
    })

    it('aggregates totals up the tree', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, quantity: 100 })),
        createAssetWithOwner(createAsset({ item_id: 2, type_id: 35, quantity: 50 })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map([[34, 5], [35, 10]]),
      })

      expect(tree[0]!.totalCount).toBe(2)
      expect(tree[0]!.totalValue).toBe(100 * 5 + 50 * 10)
    })
  })

  describe('TreeMode.ITEM_HANGAR', () => {
    it('includes non-ship items in Hangar flag', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, location_flag: 'Hangar' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
    })

    it('excludes ships from item hangar', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 587, location_flag: 'Hangar' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(0)
    })

    it('excludes offices from item hangar', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 27, location_flag: 'Hangar' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(0)
    })

    it('includes items in corp SAG divisions', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, location_flag: 'CorpSAG1' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
    })

    it('includes items nested in ships in hangar', () => {
      const ship = createAsset({ item_id: 1, type_id: 587, location_flag: 'Hangar' })
      const cargo = createAsset({ item_id: 2, type_id: 34, location_id: 1, location_type: 'item', location_flag: 'Cargo' })

      const assets: AssetWithOwner[] = [
        createAssetWithOwner(ship),
        createAssetWithOwner(cargo),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      expect(stationNode.children[0]!.nodeType).toBe('ship')
      expect(stationNode.children[0]!.children).toHaveLength(1)
    })
  })

  describe('TreeMode.SHIP_HANGAR', () => {
    it('includes only ships in Hangar flag', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 587, location_flag: 'Hangar' })),
        createAssetWithOwner(createAsset({ item_id: 2, type_id: 34, location_flag: 'Hangar' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.SHIP_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      expect(stationNode.children[0]!.typeId).toBe(587)
    })

    it('includes items inside ships as children', () => {
      const shipId = 1
      const cargoItemId = 2
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: shipId, type_id: 587, location_flag: 'Hangar' })),
        createAssetWithOwner(createAsset({ item_id: cargoItemId, type_id: 34, location_id: shipId, location_type: 'item', location_flag: 'Cargo' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.SHIP_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      const shipNode = stationNode.children[0]!
      expect(shipNode.typeId).toBe(587)
      expect(shipNode.children).toHaveLength(1)
      expect(shipNode.children[0]!.typeId).toBe(34)
    })

    it('includes fitted modules inside ships in player structures', () => {
      const structureId = 1000000000001
      const shipId = 100
      const moduleId = 101
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({
          item_id: shipId,
          type_id: 587,
          location_id: structureId,
          location_type: 'other',
          location_flag: 'Hangar'
        })),
        createAssetWithOwner(createAsset({
          item_id: moduleId,
          type_id: 34,
          location_id: shipId,
          location_type: 'item',
          location_flag: 'HiSlot0'
        })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.SHIP_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      const shipNode = stationNode.children[0]!
      expect(shipNode.typeId).toBe(587)
      expect(shipNode.nodeType).toBe('ship')
      expect(shipNode.children).toHaveLength(1)
      expect(shipNode.children[0]!.typeId).toBe(34)
    })

    it('excludes ships with AutoFit flag (active ship)', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({
          item_id: 100,
          type_id: 587,
          location_flag: 'AutoFit'
        })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.SHIP_HANGAR,
        prices: new Map(),
      })

      expect(tree).toHaveLength(0)
    })
  })

  describe('TreeMode.DELIVERIES', () => {
    it('includes items in Deliveries flag', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, location_flag: 'Deliveries' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.DELIVERIES,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
    })

    it('includes items in CorpDeliveries flag', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, location_flag: 'CorpDeliveries' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.DELIVERIES,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
    })

    it('excludes items in Hangar flag', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, location_flag: 'Hangar' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.DELIVERIES,
        prices: new Map(),
      })

      expect(tree).toHaveLength(0)
    })
  })

  describe('TreeMode.ASSET_SAFETY', () => {
    it('includes items in AssetSafety flag', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, location_flag: 'AssetSafety' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ASSET_SAFETY,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
    })
  })

  describe('TreeMode.OFFICE', () => {
    it('includes office and contents as root', () => {
      const office = createAsset({ item_id: 1, type_id: 27, location_flag: 'Hangar' })
      const itemInOffice = createAsset({ item_id: 2, type_id: 34, location_id: 1, location_type: 'item', location_flag: 'CorpSAG1' })

      const assets: AssetWithOwner[] = [
        createAssetWithOwner(office),
        createAssetWithOwner(itemInOffice),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.OFFICE,
        prices: new Map(),
      })

      expect(tree).toHaveLength(1)
      const officeNode = tree[0]!
      expect(officeNode.nodeType).toBe('office')
    })
  })

  describe('item stacking', () => {
    it('stacks identical items at same location', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, quantity: 100 })),
        createAssetWithOwner(createAsset({ item_id: 2, type_id: 34, quantity: 50 })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map([[34, 5]]),
      })

      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      expect(stationNode.children[0]!.quantity).toBe(150)
      expect(stationNode.children[0]!.totalValue).toBe(750)
    })

    it('does not stack different types', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, quantity: 100 })),
        createAssetWithOwner(createAsset({ item_id: 2, type_id: 35, quantity: 50 })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(2)
    })

    it('does not stack containers', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 17366 })),
        createAssetWithOwner(createAsset({ item_id: 2, type_id: 17366 })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(2)
    })
  })

  describe('nested items', () => {
    it('nests items inside containers', () => {
      const container = createAsset({ item_id: 1, type_id: 17366, location_flag: 'Hangar' })
      const item = createAsset({ item_id: 2, type_id: 34, location_id: 1, location_type: 'item', location_flag: 'Unlocked', quantity: 100 })

      const assets: AssetWithOwner[] = [
        createAssetWithOwner(container),
        createAssetWithOwner(item),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map([[34, 5]]),
      })

      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      expect(stationNode.children[0]!.nodeType).toBe('container')
      expect(stationNode.children[0]!.children).toHaveLength(1)
      expect(stationNode.children[0]!.children[0]!.typeId).toBe(34)
    })

    it('handles deep nesting', () => {
      const container1 = createAsset({ item_id: 1, type_id: 17366, location_flag: 'Hangar' })
      const container2 = createAsset({ item_id: 2, type_id: 17366, location_id: 1, location_type: 'item', location_flag: 'Unlocked' })
      const item = createAsset({ item_id: 3, type_id: 34, location_id: 2, location_type: 'item', location_flag: 'Unlocked' })

      const assets: AssetWithOwner[] = [
        createAssetWithOwner(container1),
        createAssetWithOwner(container2),
        createAssetWithOwner(item),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      const stationNode = tree[0]!
      const firstContainer = stationNode.children[0]!
      expect(firstContainer.nodeType).toBe('container')
      expect(firstContainer.children).toHaveLength(1)
      expect(firstContainer.children[0]!.nodeType).toBe('container')
      expect(firstContainer.children[0]!.children).toHaveLength(1)
    })
  })

  describe('custom names', () => {
    it('applies custom names to ships', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 587, location_flag: 'Hangar' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.SHIP_HANGAR,
        prices: new Map(),
        assetNames: new Map([[1, 'My Favorite Rifter']]),
      })

      const stationNode = tree[0]!
      expect(stationNode.children[0]!.name).toContain('My Favorite Rifter')
    })

    it('applies custom names to containers', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 17366, location_flag: 'Hangar' })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
        assetNames: new Map([[1, 'Minerals']]),
      })

      const stationNode = tree[0]!
      expect(stationNode.children[0]!.name).toContain('Minerals')
    })
  })

  describe('price calculations', () => {
    it('calculates value using prices map', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, quantity: 1000 })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map([[34, 4.5]]),
      })

      const stationNode = tree[0]!
      expect(stationNode.children[0]!.totalValue).toBe(4500)
    })

    it('uses zero for unknown prices', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, quantity: 1000 })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      const stationNode = tree[0]!
      expect(stationNode.children[0]!.totalValue).toBe(0)
    })
  })

  describe('deduplication', () => {
    it('deduplicates same asset from multiple owners', () => {
      const corpOwner: Owner = {
        id: 98000001,
        characterId: 12345,
        corporationId: 98000001,
        name: 'Test Corp',
        type: 'corporation',
        accessToken: null,
        refreshToken: 'corp-refresh',
        expiresAt: null,
      }
      const asset = createAsset({ item_id: 1, type_id: 34, quantity: 100 })

      const assets: AssetWithOwner[] = [
        createAssetWithOwner(asset, testOwner),
        createAssetWithOwner(asset, corpOwner),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      expect(stationNode.children[0]!.quantity).toBe(100)
    })
  })

  describe('sorting', () => {
    it('sorts nodes alphabetically', () => {
      const assets: AssetWithOwner[] = [
        createAssetWithOwner(createAsset({ item_id: 1, type_id: 35 })),
        createAssetWithOwner(createAsset({ item_id: 2, type_id: 34 })),
      ]

      const tree = buildTree(assets, {
        mode: TreeMode.ITEM_HANGAR,
        prices: new Map(),
      })

      const stationNode = tree[0]!
      expect(stationNode.children[0]!.name).toBe('Pyerite')
      expect(stationNode.children[1]!.name).toBe('Tritanium')
    })
  })
})

describe('flattenTree', () => {
  it('returns all visible nodes when expanded', () => {
    const tree = buildTree(
      [createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 }))],
      { mode: TreeMode.ITEM_HANGAR, prices: new Map() }
    )

    const allIds = getAllNodeIds(tree)
    const expanded = new Set(allIds)
    const flattened = flattenTree(tree, expanded)

    expect(flattened.length).toBeGreaterThan(1)
    expect(flattened[0]!.nodeType).toBe('station')
    expect(flattened.some(n => n.nodeType === 'item')).toBe(true)
  })

  it('hides children when parent collapsed', () => {
    const tree = buildTree(
      [createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 }))],
      { mode: TreeMode.ITEM_HANGAR, prices: new Map() }
    )

    const expanded = new Set<string>()
    const flattened = flattenTree(tree, expanded)

    expect(flattened).toHaveLength(1)
    expect(flattened[0]!.nodeType).toBe('station')
  })

  it('shows direct children when expanded', () => {
    const tree = buildTree(
      [createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 }))],
      { mode: TreeMode.ITEM_HANGAR, prices: new Map() }
    )

    const expanded = new Set([tree[0]!.id])
    const flattened = flattenTree(tree, expanded)

    expect(flattened).toHaveLength(2)
    expect(flattened[1]!.nodeType).toBe('item')
  })
})

describe('getAllNodeIds', () => {
  it('returns IDs of all expandable nodes', () => {
    const tree = buildTree(
      [createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 }))],
      { mode: TreeMode.ITEM_HANGAR, prices: new Map() }
    )

    const ids = getAllNodeIds(tree)

    expect(ids.length).toBeGreaterThan(0)
    expect(ids).toContain(tree[0]!.id)
  })

  it('excludes leaf nodes', () => {
    const tree = buildTree(
      [createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 }))],
      { mode: TreeMode.ITEM_HANGAR, prices: new Map() }
    )

    const ids = getAllNodeIds(tree)
    const stationNode = tree[0]!
    const itemNode = stationNode.children[0]!

    expect(ids).not.toContain(itemNode.id)
  })
})

describe('TreeMode.STRUCTURES', () => {
  it('excludes deployed structures with AutoFit flag', () => {
    const structure = createAsset({
      item_id: 1,
      type_id: 35832,
      location_id: 30000142,
      location_type: 'solar_system',
      location_flag: 'AutoFit',
    })

    const assets: AssetWithOwner[] = [createAssetWithOwner(structure)]

    const tree = buildTree(assets, {
      mode: TreeMode.STRUCTURES,
      prices: new Map(),
    })

    expect(tree).toHaveLength(0)
  })
})

describe('player structure locations', () => {
  it('resolves player structure names', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(
        createAsset({
          item_id: 1,
          type_id: 34,
          location_id: 1000000000001,
          location_type: 'other',
          location_flag: 'Hangar',
        })
      ),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    expect(tree).toHaveLength(1)
    const stationNode = tree[0]!
    expect(stationNode.name).toContain('Test Citadel')
    expect(stationNode.regionName).toBe('The Forge')
  })

  it('falls back to structure ID when not cached', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(
        createAsset({
          item_id: 1,
          type_id: 34,
          location_id: 1000000000002,
          location_type: 'other',
          location_flag: 'Hangar',
        })
      ),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    expect(tree).toHaveLength(1)
    const stationNode = tree[0]!
    expect(stationNode.name).toContain('1000000000002')
  })
})

describe('abyssal price support', () => {
  it('uses abyssal price when available', async () => {
    const refCache = await import('@/store/reference-cache')
    vi.mocked(refCache.getAbyssalPrice).mockReturnValueOnce(5000000)

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(createAsset({ item_id: 999, type_id: 34, quantity: 1 })),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map([[34, 5]]),
    })

    const stationNode = tree[0]!
    expect(stationNode.children[0]!.totalValue).toBe(5000000)
  })

  it('falls back to type price when no abyssal price', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(createAsset({ item_id: 1, type_id: 34, quantity: 100 })),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map([[34, 5]]),
    })

    const stationNode = tree[0]!
    expect(stationNode.children[0]!.totalValue).toBe(500)
  })
})

describe('blueprint copy stacking', () => {
  it('does not stack BPO with BPC', () => {
    const bpo = createAsset({ item_id: 1, type_id: 34, quantity: 1, is_blueprint_copy: false })
    const bpc = createAsset({ item_id: 2, type_id: 34, quantity: 1, is_blueprint_copy: true })

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(bpo),
      createAssetWithOwner(bpc),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const stationNode = tree[0]!
    expect(stationNode.children).toHaveLength(2)
  })

  it('stacks BPCs with same type together', () => {
    const bpc1 = createAsset({ item_id: 1, type_id: 34, quantity: 1, is_blueprint_copy: true })
    const bpc2 = createAsset({ item_id: 2, type_id: 34, quantity: 1, is_blueprint_copy: true })

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(bpc1),
      createAssetWithOwner(bpc2),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const stationNode = tree[0]!
    expect(stationNode.children).toHaveLength(1)
    expect(stationNode.children[0]!.quantity).toBe(2)
  })

  it('tracks stacked assets', () => {
    const item1 = createAsset({ item_id: 1, type_id: 34, quantity: 50 })
    const item2 = createAsset({ item_id: 2, type_id: 34, quantity: 50 })

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(item1),
      createAssetWithOwner(item2),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const stationNode = tree[0]!
    const stackedNode = stationNode.children[0]!
    expect(stackedNode.stackedAssets).toBeDefined()
    expect(stackedNode.stackedAssets).toHaveLength(2)
  })
})

describe('unknown location handling', () => {
  it('uses Unknown Region for missing region', async () => {
    const refCache = await import('@/store/reference-cache')
    vi.mocked(refCache.getLocation).mockReturnValueOnce(undefined)

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(
        createAsset({
          item_id: 1,
          type_id: 34,
          location_id: 99999999,
          location_type: 'station',
        })
      ),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    expect(tree[0]!.regionName).toBe('Unknown Region')
  })

  it('stores region info on station node', async () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(
        createAsset({
          item_id: 1,
          type_id: 34,
        })
      ),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const stationNode = tree[0]!
    expect(stationNode.regionName).toBe('The Forge')
    expect(stationNode.systemName).toBe('Jita')
  })
})

describe('items nested in deliveries', () => {
  it('includes items in ships in deliveries', () => {
    const ship = createAsset({
      item_id: 1,
      type_id: 587,
      location_flag: 'Deliveries',
    })
    const cargo = createAsset({
      item_id: 2,
      type_id: 34,
      location_id: 1,
      location_type: 'item',
      location_flag: 'Cargo',
    })

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(ship),
      createAssetWithOwner(cargo),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.DELIVERIES,
      prices: new Map(),
    })

    expect(tree).toHaveLength(1)
    const stationNode = tree[0]!
    const shipNode = stationNode.children[0]!
    expect(shipNode.nodeType).toBe('ship')
    expect(shipNode.children).toHaveLength(1)
  })
})

describe('items nested in asset safety', () => {
  it('includes items in ships in asset safety', () => {
    const ship = createAsset({
      item_id: 1,
      type_id: 587,
      location_flag: 'AssetSafety',
    })
    const cargo = createAsset({
      item_id: 2,
      type_id: 34,
      location_id: 1,
      location_type: 'item',
      location_flag: 'Cargo',
    })

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(ship),
      createAssetWithOwner(cargo),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ASSET_SAFETY,
      prices: new Map(),
    })

    expect(tree).toHaveLength(1)
    const stationNode = tree[0]!
    const shipNode = stationNode.children[0]!
    expect(shipNode.nodeType).toBe('ship')
    expect(shipNode.children).toHaveLength(1)
  })
})

describe('office division grouping', () => {
  it('groups items by division within office', () => {
    const office = createAsset({ item_id: 1, type_id: 27, location_flag: 'Hangar' })
    const item1 = createAsset({
      item_id: 2,
      type_id: 34,
      location_id: 1,
      location_type: 'item',
      location_flag: 'CorpSAG1',
    })
    const item2 = createAsset({
      item_id: 3,
      type_id: 35,
      location_id: 1,
      location_type: 'item',
      location_flag: 'CorpSAG2',
    })

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(office),
      createAssetWithOwner(item1),
      createAssetWithOwner(item2),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.OFFICE,
      prices: new Map(),
    })

    expect(tree).toHaveLength(1)
    const officeNode = tree[0]!
    expect(officeNode.nodeType).toBe('office')
    const divisions = officeNode.children.filter((c) => c.nodeType === 'division')
    expect(divisions.length).toBeGreaterThanOrEqual(2)
  })

  it('excludes offices inside structures from office view', () => {
    const structure = createAsset({
      item_id: 1,
      type_id: 35832,
      location_id: 30000142,
      location_type: 'solar_system',
      location_flag: 'AutoFit',
    })
    const office = createAsset({
      item_id: 2,
      type_id: 27,
      location_id: 1,
      location_type: 'item',
      location_flag: 'OfficeFolder',
    })

    const assets: AssetWithOwner[] = [
      createAssetWithOwner(structure),
      createAssetWithOwner(office),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.OFFICE,
      prices: new Map(),
    })

    expect(tree).toHaveLength(0)
  })
})

describe('filterTree', () => {
  it('returns all nodes when search is empty', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 })),
      createAssetWithOwner(createAsset({ item_id: 2, type_id: 35 })),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const filtered = filterTree(tree, '')
    expect(filtered).toHaveLength(tree.length)
  })

  it('filters by item name', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 })),
      createAssetWithOwner(createAsset({ item_id: 2, type_id: 35 })),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const filtered = filterTree(tree, 'Tritanium')
    const stationNode = filtered[0]!
    expect(stationNode.children).toHaveLength(1)
    expect(stationNode.children[0]!.name).toBe('Tritanium')
  })

  it('is case insensitive', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 })),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const filtered = filterTree(tree, 'TRITANIUM')
    const stationNode = filtered[0]!
    expect(stationNode.children).toHaveLength(1)
  })

  it('keeps parent when child matches', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 })),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const filtered = filterTree(tree, 'Tritanium')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.name).toContain('Jita')
  })

  it('filters by region name', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 })),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const filtered = filterTree(tree, 'Forge')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.regionName).toContain('Forge')
  })

  it('returns empty when no matches', () => {
    const assets: AssetWithOwner[] = [
      createAssetWithOwner(createAsset({ item_id: 1, type_id: 34 })),
    ]

    const tree = buildTree(assets, {
      mode: TreeMode.ITEM_HANGAR,
      prices: new Map(),
    })

    const filtered = filterTree(tree, 'nonexistent')
    expect(filtered).toHaveLength(0)
  })
})
