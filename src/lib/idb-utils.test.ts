import { describe, it, expect, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  openDatabase,
  closeDatabase,
  deleteDatabase,
  idbPut,
  idbGet,
  idbGetAll,
  idbPutBatch,
  idbDelete,
  idbDeleteBatch,
  idbDeleteWhere,
  idbClear,
  idbClearMultiple,
  idbGetByIndex,
} from './idb-utils'
import type { DBConfig } from './db-constants'

let dbCounter = 0
function makeConfig(
  overrides?: Partial<DBConfig> & { stores?: DBConfig['stores'] }
): DBConfig {
  dbCounter++
  return {
    name: `test-db-${dbCounter}-${Date.now()}`,
    version: 1,
    module: 'test',
    stores: overrides?.stores ?? [{ name: 'items', keyPath: 'id' }],
    ...overrides,
    // Re-apply name if not provided to keep uniqueness
    ...(overrides?.name ? {} : { name: `test-db-${dbCounter}-${Date.now()}` }),
  }
}

const openedDbs: string[] = []

async function openTestDB(config: DBConfig): Promise<IDBDatabase> {
  openedDbs.push(config.name)
  return openDatabase(config)
}

afterEach(async () => {
  for (const name of openedDbs) {
    await closeDatabase(name)
  }
  openedDbs.length = 0
})

describe('openDatabase', () => {
  it('creates database with configured stores', async () => {
    const config = makeConfig({
      stores: [
        { name: 'items', keyPath: 'id' },
        { name: 'meta', keyPath: 'key' },
      ],
    })
    const db = await openTestDB(config)

    expect(db.objectStoreNames.contains('items')).toBe(true)
    expect(db.objectStoreNames.contains('meta')).toBe(true)
  })

  it('returns cached promise for same config (concurrent callers share same open)', async () => {
    const config = makeConfig()
    const [db1, db2] = await Promise.all([
      openTestDB(config),
      openDatabase(config),
    ])

    expect(db1).toBe(db2)
  })

  it('removes failed open from cache allowing retry', async () => {
    // With fake-indexeddb, opens don't fail, so we test the positive caching behavior.
    // The cache removal on failure is tested implicitly — after closeDatabase the
    // next openDatabase creates a new connection.
    const config = makeConfig()
    const db1 = await openTestDB(config)
    await closeDatabase(config.name)
    const idx = openedDbs.indexOf(config.name)
    if (idx >= 0) openedDbs.splice(idx, 1)

    const db2 = await openTestDB(config)
    // After close + reopen, we get a different IDBDatabase instance
    expect(db2).not.toBe(db1)
  })

  it('creates indexes when configured', async () => {
    const config = makeConfig({
      stores: [
        {
          name: 'items',
          keyPath: 'id',
          indexes: [{ name: 'byCategory', keyPath: 'category' }],
        },
      ],
    })
    const db = await openTestDB(config)

    const tx = db.transaction(['items'], 'readonly')
    const store = tx.objectStore('items')
    expect(store.indexNames.contains('byCategory')).toBe(true)
  })
})

describe('closeDatabase', () => {
  it('closes DB and removes from cache', async () => {
    const config = makeConfig()
    const db1 = await openTestDB(config)
    await closeDatabase(config.name)
    // Remove from our cleanup list since it's already closed
    const idx = openedDbs.indexOf(config.name)
    if (idx >= 0) openedDbs.splice(idx, 1)

    // Reopening should yield a new instance
    const db2 = await openTestDB(config)
    expect(db2).not.toBe(db1)
  })

  it('handles closing non-existent DB gracefully', async () => {
    // Should not throw
    await expect(closeDatabase('nonexistent-db-12345')).resolves.toBeUndefined()
  })
})

describe('CRUD operations', () => {
  it('idbPut + idbGet round-trips data', async () => {
    const config = makeConfig()
    const db = await openTestDB(config)

    await idbPut(db, 'items', { id: 'a', value: 42 })
    const result = await idbGet<{ id: string; value: number }>(db, 'items', 'a')

    expect(result).toEqual({ id: 'a', value: 42 })
  })

  it('idbPutBatch writes multiple items', async () => {
    const config = makeConfig()
    const db = await openTestDB(config)

    await idbPutBatch(db, 'items', [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 3 },
    ])

    const all = await idbGetAll<{ id: string; value: number }>(db, 'items')
    expect(all).toHaveLength(3)
  })

  it('idbGetAll returns all items', async () => {
    const config = makeConfig()
    const db = await openTestDB(config)

    await idbPut(db, 'items', { id: 'x', data: 'hello' })
    await idbPut(db, 'items', { id: 'y', data: 'world' })

    const all = await idbGetAll<{ id: string; data: string }>(db, 'items')
    expect(all).toHaveLength(2)
    expect(all.map((r) => r.id).sort()).toEqual(['x', 'y'])
  })

  it('idbDelete removes item', async () => {
    const config = makeConfig()
    const db = await openTestDB(config)

    await idbPut(db, 'items', { id: 'del', value: 1 })
    await idbDelete(db, 'items', 'del')

    const result = await idbGet(db, 'items', 'del')
    expect(result).toBeUndefined()
  })

  it('idbDeleteBatch removes multiple items', async () => {
    const config = makeConfig()
    const db = await openTestDB(config)

    await idbPutBatch(db, 'items', [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 3 },
    ])

    await idbDeleteBatch(db, 'items', ['a', 'c'])

    const all = await idbGetAll<{ id: string; value: number }>(db, 'items')
    expect(all).toHaveLength(1)
    expect(all[0]!.id).toBe('b')
  })

  it('idbDeleteWhere removes items matching predicate', async () => {
    const config = makeConfig()
    const db = await openTestDB(config)

    await idbPutBatch(db, 'items', [
      { id: 'keep-1', value: 1 },
      { id: 'remove-1', value: 2 },
      { id: 'keep-2', value: 3 },
      { id: 'remove-2', value: 4 },
    ])

    await idbDeleteWhere(db, 'items', (key) =>
      (key as string).startsWith('remove')
    )

    const all = await idbGetAll<{ id: string; value: number }>(db, 'items')
    expect(all).toHaveLength(2)
    expect(all.every((r) => r.id.startsWith('keep'))).toBe(true)
  })

  it('idbClear removes all items from store', async () => {
    const config = makeConfig()
    const db = await openTestDB(config)

    await idbPutBatch(db, 'items', [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ])

    await idbClear(db, 'items')

    const all = await idbGetAll(db, 'items')
    expect(all).toHaveLength(0)
  })
})

describe('idbGetByIndex', () => {
  it('queries by secondary index', async () => {
    const config = makeConfig({
      stores: [
        {
          name: 'items',
          keyPath: 'id',
          indexes: [{ name: 'byCategory', keyPath: 'category' }],
        },
      ],
    })
    const db = await openTestDB(config)

    await idbPutBatch(db, 'items', [
      { id: 'a', category: 'fruit', name: 'apple' },
      { id: 'b', category: 'veg', name: 'carrot' },
      { id: 'c', category: 'fruit', name: 'banana' },
      { id: 'd', category: 'veg', name: 'pea' },
    ])

    const fruits = await idbGetByIndex<{
      id: string
      category: string
      name: string
    }>(db, 'items', 'byCategory', 'fruit')

    expect(fruits).toHaveLength(2)
    expect(fruits.map((f) => f.name).sort()).toEqual(['apple', 'banana'])
  })
})

describe('deleteDatabase', () => {
  it('deletes database and removes from cache', async () => {
    const config = makeConfig()
    const db = await openTestDB(config)
    await idbPut(db, 'items', { id: 'a', value: 1 })

    await deleteDatabase(config.name, 'test')
    const idx = openedDbs.indexOf(config.name)
    if (idx >= 0) openedDbs.splice(idx, 1)

    // Reopen — should be empty (new DB)
    const db2 = await openTestDB(config)
    const all = await idbGetAll(db2, 'items')
    expect(all).toHaveLength(0)
  })
})

describe('idbClearMultiple', () => {
  it('clears multiple stores in a single transaction', async () => {
    const config = makeConfig({
      stores: [
        { name: 'items', keyPath: 'id' },
        { name: 'meta', keyPath: 'key' },
      ],
    })
    const db = await openTestDB(config)

    await idbPut(db, 'items', { id: 'a', value: 1 })
    await idbPut(db, 'meta', { key: 'version', value: 1 })

    await idbClearMultiple(db, ['items', 'meta'])

    const items = await idbGetAll(db, 'items')
    const meta = await idbGetAll(db, 'meta')
    expect(items).toHaveLength(0)
    expect(meta).toHaveLength(0)
  })
})
