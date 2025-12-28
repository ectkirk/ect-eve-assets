import type { ESIRegionOrder } from '@/api/endpoints/market'
import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbDeleteBatch,
  idbClear,
} from '@/lib/idb-utils'

const STORE_ORDERS = 'orders'

export interface StoredTypeOrders {
  regionId: number
  typeId: number
  orders: ESIRegionOrder[]
  fetchedAt: number
  expiresAt: number
}

async function getDB() {
  return openDatabase(DB.REGIONAL_ORDERS)
}

function dbKey(regionId: number, typeId: number): string {
  return `${regionId}-${typeId}`
}

export async function loadAllOrdersFromDB(): Promise<StoredTypeOrders[]> {
  const db = await getDB()
  return idbGetAll<StoredTypeOrders>(db, STORE_ORDERS)
}

export async function saveOrdersToDB(record: StoredTypeOrders): Promise<void> {
  const db = await getDB()
  const key = dbKey(record.regionId, record.typeId)
  await idbPut(db, STORE_ORDERS, { ...record, id: key })
}

export async function deleteExpiredFromDB(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const db = await getDB()
  await idbDeleteBatch(db, STORE_ORDERS, keys)
}

export async function clearOrdersDB(): Promise<void> {
  const db = await getDB()
  await idbClear(db, STORE_ORDERS)
}
