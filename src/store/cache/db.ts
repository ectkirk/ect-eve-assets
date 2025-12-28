import { logger } from '@/lib/logger'
import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  closeDatabase,
  deleteDatabase as idbDeleteDatabase,
  idbGetAll,
  idbPutBatch,
  idbClear,
} from '@/lib/idb-utils'
import { cacheSchemas } from './types'

async function getDB(): Promise<IDBDatabase> {
  return openDatabase(DB.CACHE, {
    onUpgrade: (db, oldVersion, tx) => {
      if (oldVersion < 4 && db.objectStoreNames.contains('locations')) {
        tx.objectStore('locations').clear()
        logger.info('Cleared locations cache for v4 upgrade', {
          module: 'ReferenceCache',
        })
      }

      if (oldVersion < 11 && db.objectStoreNames.contains('types')) {
        tx.objectStore('types').clear()
        try {
          localStorage.removeItem('ecteveassets-all-types-loaded')
          localStorage.removeItem('ecteveassets-types-schema-version')
        } catch (err) {
          logger.warn('localStorage not available during v11 migration', {
            module: 'ReferenceCache',
            error: err instanceof Error ? err.message : String(err),
          })
        }
        logger.info('Cleared types cache for v11 upgrade (prices merged)', {
          module: 'ReferenceCache',
        })
      }

      if (oldVersion < 12 && db.objectStoreNames.contains('blueprints')) {
        db.deleteObjectStore('blueprints')
        try {
          localStorage.removeItem('ecteveassets-blueprints-loaded')
        } catch (err) {
          logger.warn('localStorage not available during v12 migration', {
            module: 'ReferenceCache',
            error: err instanceof Error ? err.message : String(err),
          })
        }
        logger.info('Removed legacy blueprints store', {
          module: 'ReferenceCache',
        })
      }
    },
  })
}

export async function loadStore<T>(storeName: string): Promise<Map<number, T>> {
  const db = await getDB()
  const schema = cacheSchemas[storeName]
  const items = await idbGetAll<unknown>(db, storeName)
  const map = new Map<number, T>()
  let invalidCount = 0

  for (const item of items) {
    if (!schema) {
      const typed = item as T & { id: number }
      map.set(typed.id, typed)
      continue
    }

    const result = schema.safeParse(item)
    if (result.success) {
      const validated = result.data as T & { id: number }
      map.set(validated.id, validated)
    } else {
      invalidCount++
    }
  }

  if (invalidCount > 0) {
    logger.warn('Skipped invalid cache entries', {
      module: 'ReferenceCache',
      store: storeName,
      invalidCount,
      validCount: map.size,
    })
  }

  return map
}

export async function writeBatch<T extends { id: number }>(
  storeName: string,
  items: T[],
  onComplete: () => void
): Promise<boolean> {
  if (items.length === 0) {
    onComplete()
    return true
  }
  try {
    const db = await getDB()
    await idbPutBatch(db, storeName, items)
    onComplete()
    return true
  } catch (err) {
    logger.error(
      'Failed to write batch to IndexedDB',
      err instanceof Error ? err : undefined,
      { module: 'ReferenceCache', store: storeName, itemCount: items.length }
    )
    return false
  }
}

export async function clearStore(storeName: string): Promise<void> {
  const db = await getDB()
  await idbClear(db, storeName)
}

export function closeCacheDB(): void {
  closeDatabase(DB.CACHE.name)
}

export async function deleteDatabase(): Promise<void> {
  await idbDeleteDatabase(DB.CACHE.name, DB.CACHE.module)
}
