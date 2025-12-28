import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  idbGetAll,
  idbPutBatch,
  idbClearMultiple,
} from '@/lib/idb-utils'

/**
 * Abyssal price storage record.
 *
 * Price semantics:
 * - `> 0`: Valid estimated price from Mutamarket
 * - `0`: Ref API returned no price (will re-fetch from Mutamarket on manual sync)
 * - `-1`: Mutamarket returned 404 or 0 (won't re-fetch)
 * - `undefined` (not in cache): Never fetched
 */
export interface AbyssalPriceRecord {
  itemId: number
  price: number
}

async function getDB() {
  return openDatabase(DB.PRICES)
}

export async function loadAbyssalPricesFromDB(): Promise<AbyssalPriceRecord[]> {
  const db = await getDB()
  return idbGetAll<AbyssalPriceRecord>(db, 'abyssal')
}

export async function saveAbyssalPricesToDB(
  prices: AbyssalPriceRecord[]
): Promise<void> {
  if (prices.length === 0) return
  const db = await getDB()
  await idbPutBatch(db, 'abyssal', prices)
}

export async function clearAbyssalDB(): Promise<void> {
  const db = await getDB()
  await idbClearMultiple(db, ['abyssal'])
}

export interface JitaPriceRecord {
  typeId: number
  price: number
}

export interface EsiPriceRecord {
  typeId: number
  average?: number
  adjusted?: number
}

export async function loadJitaPricesFromDB(): Promise<JitaPriceRecord[]> {
  const db = await getDB()
  return idbGetAll<JitaPriceRecord>(db, 'jita')
}

export async function saveJitaPricesToDB(
  prices: JitaPriceRecord[]
): Promise<void> {
  if (prices.length === 0) return
  const db = await getDB()
  await idbPutBatch(db, 'jita', prices)
}

export async function clearJitaDB(): Promise<void> {
  const db = await getDB()
  await idbClearMultiple(db, ['jita'])
}

export async function loadEsiPricesFromDB(): Promise<EsiPriceRecord[]> {
  const db = await getDB()
  return idbGetAll<EsiPriceRecord>(db, 'esi')
}

export async function saveEsiPricesToDB(
  prices: EsiPriceRecord[]
): Promise<void> {
  if (prices.length === 0) return
  const db = await getDB()
  await idbPutBatch(db, 'esi', prices)
}

export async function clearEsiDB(): Promise<void> {
  const db = await getDB()
  await idbClearMultiple(db, ['esi'])
}

export async function clearAllPricesDB(): Promise<void> {
  const db = await getDB()
  await idbClearMultiple(db, ['abyssal', 'jita', 'esi'])
}
