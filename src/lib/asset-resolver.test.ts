import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ESIAsset } from '@/api/endpoints/assets'
import type { Owner } from '@/store/auth-store'
import {
  buildAssetLookupMap,
  buildParentChain,
  getRootFlag,
  computeModeFlags,
  resolveAsset,
  resolveMarketOrder,
} from './asset-resolver'

vi.mock('@/store/reference-cache', () => ({
  getType: vi.fn((typeId: number) => {
    const types: Record<
      number,
      {
        categoryId: number
        groupId: number
        name: string
        volume?: number
        packagedVolume?: number
      }
    > = {
      34: { categoryId: 4, groupId: 18, name: 'Tritanium', volume: 0.01 },
      587: {
        categoryId: 6,
        groupId: 25,
        name: 'Rifter',
        volume: 27289,
        packagedVolume: 2500,
      },
      35832: { categoryId: 65, groupId: 1404, name: 'Astrahus', volume: 8000 },
      27: { categoryId: 2, groupId: 10, name: 'Office' },
    }
    return types[typeId]
  }),
  getStructure: vi.fn((id: number) => {
    if (id === 1000000000001) {
      return { id, name: 'Test Structure', solarSystemId: 30000142 }
    }
    return undefined
  }),
  getLocation: vi.fn((id: number) => {
    const locations: Record<
      number,
      { id: number; name: string; regionId?: number; solarSystemId?: number }
    > = {
      60003760: {
        id: 60003760,
        name: 'Jita 4-4',
        solarSystemId: 30000142,
        regionId: 10000002,
      },
      30000142: { id: 30000142, name: 'Jita', regionId: 10000002 },
    }
    return locations[id]
  }),
  CategoryIds: {
    SHIP: 6,
    STRUCTURE: 65,
    STARBASE: 23,
    OWNER: 1,
    STATION: 3,
  },
}))

vi.mock('@/store/price-store', () => ({
  usePriceStore: {
    getState: () => ({
      getItemPrice: vi.fn(() => 100),
    }),
  },
}))

const createMockOwner = (overrides?: Partial<Owner>): Owner => ({
  id: 12345,
  characterId: 12345,
  corporationId: 98000001,
  name: 'Test Pilot',
  type: 'character',
  accessToken: 'token',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3600000,
  ...overrides,
})

const createMockAsset = (overrides?: Partial<ESIAsset>): ESIAsset => ({
  item_id: 1,
  type_id: 34,
  location_id: 60003760,
  location_type: 'station',
  location_flag: 'Hangar',
  quantity: 100,
  is_singleton: false,
  ...overrides,
})

describe('asset-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildAssetLookupMap', () => {
    it('creates maps from assets by owner', () => {
      const owner = createMockOwner()
      const assets = [
        createMockAsset({ item_id: 1 }),
        createMockAsset({ item_id: 2 }),
      ]

      const lookupMap = buildAssetLookupMap([{ owner, assets }])

      expect(lookupMap.itemIdToAsset.size).toBe(2)
      expect(lookupMap.itemIdToOwner.size).toBe(2)
      expect(lookupMap.itemIdToAsset.get(1)).toBe(assets[0])
      expect(lookupMap.itemIdToOwner.get(1)).toBe(owner)
    })

    it('handles multiple owners', () => {
      const owner1 = createMockOwner({ id: 111 })
      const owner2 = createMockOwner({ id: 222 })

      const lookupMap = buildAssetLookupMap([
        { owner: owner1, assets: [createMockAsset({ item_id: 1 })] },
        { owner: owner2, assets: [createMockAsset({ item_id: 2 })] },
      ])

      expect(lookupMap.itemIdToOwner.get(1)).toBe(owner1)
      expect(lookupMap.itemIdToOwner.get(2)).toBe(owner2)
    })
  })

  describe('buildParentChain', () => {
    it('returns empty array for root-level assets', () => {
      const asset = createMockAsset({ location_type: 'station' })
      const itemIdToAsset = new Map<number, ESIAsset>()

      const chain = buildParentChain(asset, itemIdToAsset)

      expect(chain).toHaveLength(0)
    })

    it('builds chain for nested assets', () => {
      const container = createMockAsset({
        item_id: 100,
        type_id: 587,
        location_type: 'station',
        location_flag: 'ShipHangar',
      })
      const cargo = createMockAsset({
        item_id: 1,
        location_id: 100,
        location_type: 'item',
        location_flag: 'Cargo',
      })

      const itemIdToAsset = new Map<number, ESIAsset>([[100, container]])

      const chain = buildParentChain(cargo, itemIdToAsset)

      expect(chain).toHaveLength(1)
      expect(chain[0]).toBe(container)
    })

    it('builds deep chain', () => {
      const ship = createMockAsset({
        item_id: 100,
        type_id: 587,
        location_type: 'station',
        location_flag: 'ShipHangar',
      })
      const container = createMockAsset({
        item_id: 50,
        location_id: 100,
        location_type: 'item',
        location_flag: 'Cargo',
      })
      const item = createMockAsset({
        item_id: 1,
        location_id: 50,
        location_type: 'item',
        location_flag: 'Unlocked',
      })

      const itemIdToAsset = new Map<number, ESIAsset>([
        [100, ship],
        [50, container],
      ])

      const chain = buildParentChain(item, itemIdToAsset)

      expect(chain).toHaveLength(2)
      expect(chain[0]).toBe(container)
      expect(chain[1]).toBe(ship)
    })
  })

  describe('getRootFlag', () => {
    it('returns asset flag when no parents', () => {
      const asset = createMockAsset({ location_flag: 'Hangar' })

      const flag = getRootFlag(asset, [])

      expect(flag).toBe('Hangar')
    })

    it('returns top parent flag when chain exists', () => {
      const asset = createMockAsset({ location_flag: 'Cargo' })
      const parent = createMockAsset({ location_flag: 'ShipHangar' })

      const flag = getRootFlag(asset, [parent])

      expect(flag).toBe('ShipHangar')
    })
  })

  describe('computeModeFlags', () => {
    it('sets inHangar for Hangar flag', () => {
      const asset = createMockAsset({ location_flag: 'Hangar' })

      const flags = computeModeFlags(asset, [], 'Hangar', new Set())

      expect(flags.inHangar).toBe(true)
      expect(flags.inItemHangar).toBe(true)
      expect(flags.inShipHangar).toBe(false)
    })

    it('sets inShipHangar for ships in hangar', () => {
      const asset = createMockAsset({ type_id: 587, location_flag: 'Hangar' })

      const flags = computeModeFlags(asset, [], 'Hangar', new Set())

      expect(flags.inHangar).toBe(true)
      expect(flags.inShipHangar).toBe(true)
      expect(flags.inItemHangar).toBe(false)
    })

    it('sets inDeliveries for CorpDeliveries flag', () => {
      const asset = createMockAsset({ location_flag: 'CorpDeliveries' })

      const flags = computeModeFlags(asset, [], 'CorpDeliveries', new Set())

      expect(flags.inDeliveries).toBe(true)
    })

    it('sets inAssetSafety for AssetSafety flag', () => {
      const asset = createMockAsset({ location_flag: 'AssetSafety' })

      const flags = computeModeFlags(asset, [], 'AssetSafety', new Set())

      expect(flags.inAssetSafety).toBe(true)
    })

    it('sets isContract for InContract flag', () => {
      const asset = createMockAsset({ location_flag: 'InContract' })

      const flags = computeModeFlags(asset, [], 'InContract', new Set())

      expect(flags.isContract).toBe(true)
    })

    it('sets isMarketOrder for SellOrder flag', () => {
      const asset = createMockAsset({ location_flag: 'SellOrder' })

      const flags = computeModeFlags(asset, [], 'SellOrder', new Set())

      expect(flags.isMarketOrder).toBe(true)
    })

    it('sets isActiveShip for ActiveShip flag', () => {
      const asset = createMockAsset({ location_flag: 'ActiveShip' })

      const flags = computeModeFlags(asset, [], 'ActiveShip', new Set())

      expect(flags.isActiveShip).toBe(true)
    })

    it('sets isOwnedStructure when asset is in owned structures set', () => {
      const asset = createMockAsset({ item_id: 12345 })

      const flags = computeModeFlags(asset, [], 'Hangar', new Set([12345]))

      expect(flags.isOwnedStructure).toBe(true)
    })
  })

  describe('resolveAsset', () => {
    it('resolves basic asset properties', () => {
      const owner = createMockOwner()
      const asset = createMockAsset({
        item_id: 1,
        type_id: 34,
        quantity: 1000,
      })
      const lookupMap = buildAssetLookupMap([{ owner, assets: [asset] }])
      const context = {
        assetNames: new Map<number, string>(),
        ownedStructureIds: new Set<number>(),
        starbaseMoonIds: new Map<number, number>(),
      }

      const resolved = resolveAsset(asset, owner, lookupMap, context)

      expect(resolved.asset).toBe(asset)
      expect(resolved.owner).toBe(owner)
      expect(resolved.typeId).toBe(34)
      expect(resolved.categoryId).toBe(4)
      expect(resolved.groupId).toBe(18)
      expect(resolved.rootLocationId).toBe(60003760)
      expect(resolved.rootLocationType).toBe('station')
    })

    it('uses custom name when available', () => {
      const owner = createMockOwner()
      const asset = createMockAsset({ item_id: 1, type_id: 587 })
      const lookupMap = buildAssetLookupMap([{ owner, assets: [asset] }])
      const context = {
        assetNames: new Map<number, string>([[1, 'My Ship']]),
        ownedStructureIds: new Set<number>(),
        starbaseMoonIds: new Map<number, number>(),
      }

      const resolved = resolveAsset(asset, owner, lookupMap, context)

      expect(resolved.customName).toBe('My Ship')
    })

    it('handles blueprint copies', () => {
      const owner = createMockOwner()
      const asset = createMockAsset({
        item_id: 1,
        type_id: 34,
        is_blueprint_copy: true,
      })
      const lookupMap = buildAssetLookupMap([{ owner, assets: [asset] }])
      const context = {
        assetNames: new Map<number, string>(),
        ownedStructureIds: new Set<number>(),
        starbaseMoonIds: new Map<number, number>(),
      }

      const resolved = resolveAsset(asset, owner, lookupMap, context)

      expect(resolved.isBlueprintCopy).toBe(true)
    })

    it('calculates totalValue correctly', () => {
      const owner = createMockOwner()
      const asset = createMockAsset({
        item_id: 1,
        type_id: 34,
        quantity: 1000,
      })
      const lookupMap = buildAssetLookupMap([{ owner, assets: [asset] }])
      const context = {
        assetNames: new Map<number, string>(),
        ownedStructureIds: new Set<number>(),
        starbaseMoonIds: new Map<number, number>(),
      }

      const resolved = resolveAsset(asset, owner, lookupMap, context)

      expect(resolved.totalValue).toBe(100 * 1000)
    })
  })

  describe('resolveMarketOrder', () => {
    it('creates synthetic asset from market order', () => {
      const owner = createMockOwner()
      const order = {
        order_id: 12345,
        type_id: 34,
        location_id: 60003760,
        volume_remain: 100,
        volume_total: 1000,
        price: 10,
        is_buy_order: false,
        duration: 90,
        issued: '2024-01-01T00:00:00Z',
        range: 'station' as const,
        region_id: 10000002,
        min_volume: 1,
        is_corporation: false,
      }

      const resolved = resolveMarketOrder(order, owner)

      expect(resolved.asset.item_id).toBe(12345)
      expect(resolved.asset.type_id).toBe(34)
      expect(resolved.asset.quantity).toBe(100)
      expect(resolved.asset.location_flag).toBe('SellOrder')
      expect(resolved.modeFlags.isMarketOrder).toBe(true)
      expect(resolved.rootFlag).toBe('SellOrder')
    })
  })
})
