import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbPutBatch,
  idbDeleteBatch,
  idbClearMultiple,
} from '@/lib/idb-utils'

const STORE_PRICES = 'prices'
const STORE_TRACKED = 'tracked'
const STORE_STRUCTURES = 'structures'

export interface PriceRecord {
  typeId: number
  lowestPrice: number | null
  highestBuyPrice: number | null
  locationPrices: Record<number, number>
  buyLocationPrices: Record<number, number>
  lastFetchAt: number
}

export interface TrackedRecord {
  key: string
  typeId: number
  regionId: number
}

export interface TrackedStructureRecord {
  structureId: number
  characterId: number
  typeIds: number[]
  lastFetchAt: number
}

async function getDB() {
  return openDatabase(DB.REGIONAL_MARKET)
}

export async function loadFromDB(): Promise<{
  prices: PriceRecord[]
  tracked: TrackedRecord[]
  structures: TrackedStructureRecord[]
}> {
  const db = await getDB()
  const [prices, tracked, structures] = await Promise.all([
    idbGetAll<PriceRecord>(db, STORE_PRICES),
    idbGetAll<TrackedRecord>(db, STORE_TRACKED),
    idbGetAll<TrackedStructureRecord>(db, STORE_STRUCTURES),
  ])
  return { prices, tracked, structures }
}

export async function savePricesToDB(records: PriceRecord[]): Promise<void> {
  if (records.length === 0) return
  const db = await getDB()
  await idbPutBatch(db, STORE_PRICES, records)
}

export async function saveTrackedToDB(records: TrackedRecord[]): Promise<void> {
  if (records.length === 0) return
  const db = await getDB()
  await idbPutBatch(db, STORE_TRACKED, records)
}

export async function deleteTrackedFromDB(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const db = await getDB()
  await idbDeleteBatch(db, STORE_TRACKED, keys)
}

export async function deletePricesFromDB(typeIds: number[]): Promise<void> {
  if (typeIds.length === 0) return
  const db = await getDB()
  await idbDeleteBatch(db, STORE_PRICES, typeIds)
}

export async function saveStructureToDB(
  record: TrackedStructureRecord
): Promise<void> {
  const db = await getDB()
  await idbPut(db, STORE_STRUCTURES, record)
}

export async function saveStructuresToDB(
  records: TrackedStructureRecord[]
): Promise<void> {
  if (records.length === 0) return
  const db = await getDB()
  await idbPutBatch(db, STORE_STRUCTURES, records)
}

export async function deleteStructuresFromDB(
  structureIds: number[]
): Promise<void> {
  if (structureIds.length === 0) return
  const db = await getDB()
  await idbDeleteBatch(db, STORE_STRUCTURES, structureIds)
}

export async function clearDB(): Promise<void> {
  const db = await getDB()
  await idbClearMultiple(db, [STORE_PRICES, STORE_TRACKED, STORE_STRUCTURES])
}
