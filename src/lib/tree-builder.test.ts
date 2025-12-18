import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildTree, flattenTree, getAllNodeIds, filterTree } from './tree-builder'
import { TreeMode } from './tree-types'
import type { ESIAsset } from '@/api/endpoints/assets'
import type { Owner } from '@/store/auth-store'
import type { ResolvedAsset, AssetModeFlags } from './resolved-asset'

vi.mock('@/store/reference-cache', () => ({
  getType: vi.fn((id: number) => {
    const types: Record<number, { id: number; name: string; categoryId: number; categoryName: string; groupId: number; groupName: string; volume: number; packagedVolume?: number }> = {
      34: { id: 34, name: 'Tritanium', categoryId: 4, categoryName: 'Material', groupId: 18, groupName: 'Mineral', volume: 0.01 },
      35: { id: 35, name: 'Pyerite', categoryId: 4, categoryName: 'Material', groupId: 18, groupName: 'Mineral', volume: 0.01 },
      587: { id: 587, name: 'Rifter', categoryId: 6, categoryName: 'Ship', groupId: 25, groupName: 'Frigate', volume: 27289, packagedVolume: 2500 },
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

function createModeFlags(overrides: Partial<AssetModeFlags> = {}): AssetModeFlags {
  return {
    inHangar: false,
    inShipHangar: false,
    inItemHangar: false,
    inDeliveries: false,
    inAssetSafety: false,
    inOffice: false,
    inStructure: false,
    isContract: false,
    isMarketOrder: false,
    isIndustryJob: false,
    isOwnedStructure: false,
    isActiveShip: false,
    ...overrides,
  }
}

function createResolvedAsset(
  asset: ESIAsset,
  overrides: Partial<Omit<ResolvedAsset, 'asset' | 'owner'>> = {},
  owner: Owner = testOwner
): ResolvedAsset {
  const typeMap: Record<number, { name: string; categoryId: number; categoryName: string; groupId: number; groupName: string; volume: number }> = {
    34: { name: 'Tritanium', categoryId: 4, categoryName: 'Material', groupId: 18, groupName: 'Mineral', volume: 0.01 },
    35: { name: 'Pyerite', categoryId: 4, categoryName: 'Material', groupId: 18, groupName: 'Mineral', volume: 0.01 },
    587: { name: 'Rifter', categoryId: 6, categoryName: 'Ship', groupId: 25, groupName: 'Frigate', volume: 2500 },
    17366: { name: 'Station Container', categoryId: 2, categoryName: 'Celestial', groupId: 448, groupName: 'Audit Log Secure Container', volume: 10000 },
    27: { name: 'Office', categoryId: 2, categoryName: 'Celestial', groupId: 16, groupName: 'Station Services', volume: 0 },
    35832: { name: 'Astrahus', categoryId: 65, categoryName: 'Structure', groupId: 1657, groupName: 'Citadel', volume: 8000 },
  }

  const typeInfo = typeMap[asset.type_id] ?? { name: `Unknown ${asset.type_id}`, categoryId: 0, categoryName: '', groupId: 0, groupName: '', volume: 0 }
  const price = overrides.price ?? 0

  return {
    asset,
    owner,
    rootLocationId: overrides.rootLocationId ?? 60003760,
    rootLocationType: overrides.rootLocationType ?? 'station',
    parentChain: overrides.parentChain ?? [],
    rootFlag: overrides.rootFlag ?? asset.location_flag,
    locationName: overrides.locationName ?? 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    systemId: overrides.systemId ?? 30000142,
    systemName: overrides.systemName ?? 'Jita',
    regionId: overrides.regionId ?? 10000002,
    regionName: overrides.regionName ?? 'The Forge',
    typeId: asset.type_id,
    typeName: overrides.typeName ?? typeInfo.name,
    categoryId: overrides.categoryId ?? typeInfo.categoryId,
    categoryName: overrides.categoryName ?? typeInfo.categoryName,
    groupId: overrides.groupId ?? typeInfo.groupId,
    groupName: overrides.groupName ?? typeInfo.groupName,
    volume: overrides.volume ?? typeInfo.volume,
    price,
    totalValue: overrides.totalValue ?? price * asset.quantity,
    totalVolume: overrides.totalVolume ?? typeInfo.volume * asset.quantity,
    modeFlags: overrides.modeFlags ?? createModeFlags({ inItemHangar: true, inHangar: true }),
    customName: overrides.customName,
    isBlueprintCopy: overrides.isBlueprintCopy ?? false,
    stackKey: overrides.stackKey ?? `${owner.id}-${asset.type_id}-60003760-${asset.location_flag}-false-${typeInfo.name}`,
  }
}

describe('buildTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('basic tree structure', () => {
    it('creates flat station hierarchy with region in name', () => {
      const asset = createAsset({ item_id: 1, type_id: 34, quantity: 100 })
      const resolved = createResolvedAsset(asset, { price: 5 })
      const assets: ResolvedAsset[] = [resolved]

      const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

      expect(tree).toHaveLength(1)
      expect(tree[0]!.nodeType).toBe('station')
      expect(tree[0]!.name).toContain('Jita')
      expect(tree[0]!.regionName).toBe('The Forge')
    })

    it('aggregates totals up the tree', () => {
      const asset1 = createAsset({ item_id: 1, type_id: 34, quantity: 100 })
      const asset2 = createAsset({ item_id: 2, type_id: 35, quantity: 50 })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset1, { price: 5 }),
        createResolvedAsset(asset2, { price: 10 }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

      expect(tree[0]!.totalCount).toBe(2)
      expect(tree[0]!.totalValue).toBe(100 * 5 + 50 * 10)
    })
  })

  describe('TreeMode.ITEM_HANGAR', () => {
    it('includes non-ship items in Hangar flag', () => {
      const asset = createAsset({ item_id: 1, type_id: 34, location_flag: 'Hangar' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset, { modeFlags: createModeFlags({ inItemHangar: true, inHangar: true }) }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

      expect(tree).toHaveLength(1)
      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
    })

    it('excludes ships from item hangar', () => {
      const asset = createAsset({ item_id: 1, type_id: 587, location_flag: 'Hangar' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset, { modeFlags: createModeFlags({ inShipHangar: true, inHangar: true }) }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

      expect(tree).toHaveLength(0)
    })
  })

  describe('TreeMode.SHIP_HANGAR', () => {
    it('includes ships in Hangar flag', () => {
      const asset = createAsset({ item_id: 1, type_id: 587, location_flag: 'Hangar' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset, { modeFlags: createModeFlags({ inShipHangar: true, inHangar: true }) }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.SHIP_HANGAR })

      expect(tree).toHaveLength(1)
      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      expect(stationNode.children[0]!.nodeType).toBe('ship')
    })

    it('excludes non-ships from ship hangar', () => {
      const asset = createAsset({ item_id: 1, type_id: 34, location_flag: 'Hangar' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset, { modeFlags: createModeFlags({ inItemHangar: true, inHangar: true }) }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.SHIP_HANGAR })

      expect(tree).toHaveLength(0)
    })
  })

  describe('TreeMode.DELIVERIES', () => {
    it('includes items with Deliveries flag', () => {
      const asset = createAsset({ item_id: 1, type_id: 34, location_flag: 'Deliveries' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset, { modeFlags: createModeFlags({ inDeliveries: true }), rootFlag: 'Deliveries' }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.DELIVERIES })

      expect(tree).toHaveLength(1)
    })

    it('excludes non-delivery items', () => {
      const asset = createAsset({ item_id: 1, type_id: 34, location_flag: 'Hangar' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset, { modeFlags: createModeFlags({ inItemHangar: true }) }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.DELIVERIES })

      expect(tree).toHaveLength(0)
    })
  })

  describe('TreeMode.ASSET_SAFETY', () => {
    it('includes items with AssetSafety flag', () => {
      const asset = createAsset({ item_id: 1, type_id: 34, location_flag: 'AssetSafety' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset, { modeFlags: createModeFlags({ inAssetSafety: true }), rootFlag: 'AssetSafety' }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ASSET_SAFETY })

      expect(tree).toHaveLength(1)
    })
  })

  describe('TreeMode.OFFICE', () => {
    it('includes items in office', () => {
      const officeAsset = createAsset({ item_id: 100, type_id: 27, location_flag: 'CorpSAG1' })
      const itemAsset = createAsset({ item_id: 1, type_id: 34, location_flag: 'CorpSAG1', location_type: 'item', location_id: 100 })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(officeAsset, { modeFlags: createModeFlags({ inOffice: true }) }),
        createResolvedAsset(itemAsset, { modeFlags: createModeFlags({ inOffice: true }), parentChain: [officeAsset] }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.OFFICE })

      expect(tree.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('TreeMode.ALL', () => {
    it('includes all items', () => {
      const asset1 = createAsset({ item_id: 1, type_id: 34, location_flag: 'Hangar' })
      const asset2 = createAsset({ item_id: 2, type_id: 587, location_flag: 'Hangar' })
      const asset3 = createAsset({ item_id: 3, type_id: 34, location_flag: 'Deliveries' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
        createResolvedAsset(asset2, { modeFlags: createModeFlags({ inShipHangar: true }) }),
        createResolvedAsset(asset3, { modeFlags: createModeFlags({ inDeliveries: true }) }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ALL })

      expect(tree).toHaveLength(1)
      expect(tree[0]!.totalCount).toBe(3)
    })

    it('excludes contract items in non-ALL modes', () => {
      const asset = createAsset({ item_id: 1, type_id: 34, location_flag: 'InContract' })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset, { modeFlags: createModeFlags({ isContract: true }) }),
      ]

      const itemHangarTree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })
      expect(itemHangarTree).toHaveLength(0)

      const allTree = buildTree(assets, { mode: TreeMode.ALL })
      expect(allTree).toHaveLength(1)
    })
  })

  describe('stacking', () => {
    it('stacks identical items at same level', () => {
      const asset1 = createAsset({ item_id: 1, type_id: 34, quantity: 100 })
      const asset2 = createAsset({ item_id: 2, type_id: 34, quantity: 50 })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
        createResolvedAsset(asset2, { modeFlags: createModeFlags({ inItemHangar: true }) }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

      expect(tree).toHaveLength(1)
      expect(tree[0]!.children).toHaveLength(1)
      expect(tree[0]!.children[0]!.quantity).toBe(150)
    })

    it('does not stack items with different owners', () => {
      const otherOwner: Owner = { ...testOwner, id: 99999, name: 'Other Character' }
      const asset1 = createAsset({ item_id: 1, type_id: 34, quantity: 100 })
      const asset2 = createAsset({ item_id: 2, type_id: 34, quantity: 50 })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }, testOwner),
        createResolvedAsset(asset2, { modeFlags: createModeFlags({ inItemHangar: true }) }, otherOwner),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

      expect(tree[0]!.children).toHaveLength(2)
    })

    it('does not stack items with different types', () => {
      const asset1 = createAsset({ item_id: 1, type_id: 34, quantity: 100 })
      const asset2 = createAsset({ item_id: 2, type_id: 35, quantity: 50 })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
        createResolvedAsset(asset2, { modeFlags: createModeFlags({ inItemHangar: true }) }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

      expect(tree[0]!.children).toHaveLength(2)
    })
  })

  describe('nested structures', () => {
    it('creates hierarchy for items in ships', () => {
      const shipAsset = createAsset({ item_id: 100, type_id: 587, location_flag: 'Hangar', is_singleton: true })
      const cargoAsset = createAsset({ item_id: 1, type_id: 34, location_flag: 'Cargo', location_type: 'item', location_id: 100 })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(shipAsset, { modeFlags: createModeFlags({ inShipHangar: true }) }),
        createResolvedAsset(cargoAsset, { modeFlags: createModeFlags({ inShipHangar: true }), parentChain: [shipAsset] }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ALL })

      expect(tree).toHaveLength(1)
      const stationNode = tree[0]!
      expect(stationNode.children).toHaveLength(1)
      const shipNode = stationNode.children[0]!
      expect(shipNode.nodeType).toBe('ship')
      expect(shipNode.children).toHaveLength(1)
      expect(shipNode.children[0]!.typeId).toBe(34)
    })

    it('creates hierarchy for items in containers', () => {
      const containerAsset = createAsset({ item_id: 100, type_id: 17366, location_flag: 'Hangar', is_singleton: true })
      const itemAsset = createAsset({ item_id: 1, type_id: 34, location_flag: 'Unlocked', location_type: 'item', location_id: 100 })
      const assets: ResolvedAsset[] = [
        createResolvedAsset(containerAsset, { modeFlags: createModeFlags({ inItemHangar: true }) }),
        createResolvedAsset(itemAsset, { modeFlags: createModeFlags({ inItemHangar: true }), parentChain: [containerAsset] }),
      ]

      const tree = buildTree(assets, { mode: TreeMode.ALL })

      expect(tree).toHaveLength(1)
      const containerNode = tree[0]!.children[0]!
      expect(containerNode.nodeType).toBe('container')
      expect(containerNode.children).toHaveLength(1)
    })
  })
})

describe('flattenTree', () => {
  it('returns all nodes when all are expanded', () => {
    const asset1 = createAsset({ item_id: 1, type_id: 34 })
    const assets: ResolvedAsset[] = [
      createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
    ]
    const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

    const expandedNodes = new Set(getAllNodeIds(tree))
    const flattened = flattenTree(tree, expandedNodes)

    expect(flattened.length).toBeGreaterThan(0)
  })

  it('returns only root nodes when none are expanded', () => {
    const asset1 = createAsset({ item_id: 1, type_id: 34 })
    const assets: ResolvedAsset[] = [
      createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
    ]
    const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

    const flattened = flattenTree(tree, new Set())

    expect(flattened).toHaveLength(1)
    expect(flattened[0]!.nodeType).toBe('station')
  })
})

describe('getAllNodeIds', () => {
  it('returns IDs of nodes with children', () => {
    const asset1 = createAsset({ item_id: 1, type_id: 34 })
    const assets: ResolvedAsset[] = [
      createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
    ]
    const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

    const ids = getAllNodeIds(tree)

    expect(ids).toContain('station-60003760')
  })
})

describe('filterTree', () => {
  it('filters by search term', () => {
    const asset1 = createAsset({ item_id: 1, type_id: 34 })
    const asset2 = createAsset({ item_id: 2, type_id: 587 })
    const assets: ResolvedAsset[] = [
      createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
      createResolvedAsset(asset2, { modeFlags: createModeFlags({ inShipHangar: true }) }),
    ]
    const tree = buildTree(assets, { mode: TreeMode.ALL })

    const filtered = filterTree(tree, 'Tritanium')

    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.children).toHaveLength(1)
    expect(filtered[0]!.children[0]!.name).toBe('Tritanium')
  })

  it('filters by category', () => {
    const asset1 = createAsset({ item_id: 1, type_id: 34 })
    const asset2 = createAsset({ item_id: 2, type_id: 587 })
    const assets: ResolvedAsset[] = [
      createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
      createResolvedAsset(asset2, { modeFlags: createModeFlags({ inShipHangar: true }) }),
    ]
    const tree = buildTree(assets, { mode: TreeMode.ALL })

    const filtered = filterTree(tree, '', 'Ship')

    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.children).toHaveLength(1)
    expect(filtered[0]!.children[0]!.categoryName).toBe('Ship')
  })

  it('returns unfiltered tree when no search or category', () => {
    const asset1 = createAsset({ item_id: 1, type_id: 34 })
    const assets: ResolvedAsset[] = [
      createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }) }),
    ]
    const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

    const filtered = filterTree(tree, '')

    expect(filtered).toBe(tree)
  })

  it('recalculates totals after filtering', () => {
    const asset1 = createAsset({ item_id: 1, type_id: 34, quantity: 100 })
    const asset2 = createAsset({ item_id: 2, type_id: 35, quantity: 50 })
    const assets: ResolvedAsset[] = [
      createResolvedAsset(asset1, { modeFlags: createModeFlags({ inItemHangar: true }), price: 5 }),
      createResolvedAsset(asset2, { modeFlags: createModeFlags({ inItemHangar: true }), price: 10 }),
    ]
    const tree = buildTree(assets, { mode: TreeMode.ITEM_HANGAR })

    const filtered = filterTree(tree, 'Tritanium')

    expect(filtered[0]!.totalCount).toBe(1)
    expect(filtered[0]!.totalValue).toBe(500)
  })
})
