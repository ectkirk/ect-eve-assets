/**
 * Centralized IndexedDB database registry.
 *
 * All IndexedDB databases in the application are defined here
 * to prevent name collisions and provide a single source of truth.
 */

export interface DBStoreConfig {
  name: string
  keyPath: string
  indexes?: Array<{ name: string; keyPath: string; unique?: boolean }>
}

export interface DBConfig {
  name: string
  version: number
  stores: DBStoreConfig[]
  module: string
}

export const DB = {
  CACHE: {
    name: 'ecteveassets-cache',
    version: 13,
    stores: [
      { name: 'types', keyPath: 'id' },
      { name: 'structures', keyPath: 'id' },
      { name: 'locations', keyPath: 'id' },
      { name: 'abyssals', keyPath: 'id' },
      { name: 'names', keyPath: 'id' },
      { name: 'categories', keyPath: 'id' },
      { name: 'groups', keyPath: 'id' },
      { name: 'regions', keyPath: 'id' },
      { name: 'systems', keyPath: 'id' },
      { name: 'stations', keyPath: 'id' },
      { name: 'stargates', keyPath: 'id' },
      { name: 'refStructures', keyPath: 'id' },
    ],
    module: 'ReferenceCache',
  },

  EXPIRY: {
    name: 'ecteveassets-expiry',
    version: 1,
    stores: [{ name: 'expiry', keyPath: 'key' }],
    module: 'ExpiryCacheStore',
  },

  PRICES: {
    name: 'ecteveassets-prices',
    version: 3,
    stores: [
      { name: 'abyssal', keyPath: 'itemId' },
      { name: 'jita', keyPath: 'typeId' },
      { name: 'esi', keyPath: 'typeId' },
    ],
    module: 'PriceStore',
  },

  REGIONAL_MARKET: {
    name: 'ecteveassets-regional-market',
    version: 2,
    stores: [
      { name: 'prices', keyPath: 'typeId' },
      { name: 'tracked', keyPath: 'key' },
      { name: 'structures', keyPath: 'structureId' },
    ],
    module: 'RegionalMarketDB',
  },

  REGIONAL_ORDERS: {
    name: 'ecteveassets-regional-orders',
    version: 1,
    stores: [{ name: 'orders', keyPath: 'regionId' }],
    module: 'RegionalOrdersDB',
  },

  STARBASE_DETAILS: {
    name: 'ecteveassets-starbase-details',
    version: 2,
    stores: [
      {
        name: 'details',
        keyPath: 'starbaseId',
        indexes: [{ name: 'corporationId', keyPath: 'corporationId' }],
      },
    ],
    module: 'StarbaseDetailsStore',
  },

  ASSETS: {
    name: 'ecteveassets-assets',
    version: 1,
    stores: [
      { name: 'assets', keyPath: 'ownerKey' },
      { name: 'meta', keyPath: 'key' },
    ],
    module: 'AssetStore',
  },

  CONTRACTS: {
    name: 'ecteveassets-contracts',
    version: 1,
    stores: [
      { name: 'contracts', keyPath: 'contract_id' },
      { name: 'visibility', keyPath: 'ownerKey' },
    ],
    module: 'ContractsStore',
  },

  MARKET_ORDERS: {
    name: 'ecteveassets-orders',
    version: 1,
    stores: [
      { name: 'orders', keyPath: 'ownerKey' },
      { name: 'meta', keyPath: 'key' },
    ],
    module: 'MarketOrdersStore',
  },

  INDUSTRY_JOBS: {
    name: 'ecteveassets-industry',
    version: 1,
    stores: [
      { name: 'jobs', keyPath: 'ownerKey' },
      { name: 'meta', keyPath: 'key' },
    ],
    module: 'IndustryJobsStore',
  },

  CLONES: {
    name: 'ecteveassets-clones',
    version: 1,
    stores: [{ name: 'clones', keyPath: 'ownerKey' }],
    module: 'ClonesStore',
  },

  STRUCTURES: {
    name: 'ecteveassets-structures-store',
    version: 1,
    stores: [
      { name: 'structures', keyPath: 'ownerKey' },
      { name: 'meta', keyPath: 'key' },
    ],
    module: 'StructuresStore',
  },

  DIVISIONS: {
    name: 'ecteveassets-divisions',
    version: 1,
    stores: [{ name: 'divisions', keyPath: 'corporationId' }],
    module: 'DivisionsStore',
  },

  CONTRACT_ITEMS: {
    name: 'ecteveassets-contract-items',
    version: 1,
    stores: [{ name: 'items', keyPath: 'contractId' }],
    module: 'ContractsStore',
  },

  ANSIBLEX: {
    name: 'ecteveassets-ansiblex',
    version: 1,
    stores: [{ name: 'ansiblexes', keyPath: 'characterId' }],
    module: 'AnsiblexStore',
  },
} as const satisfies Record<string, DBConfig>
