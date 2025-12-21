import { create } from 'zustand'
import { useAuthStore, type Owner, type OwnerType, ownerKey, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { useToastStore } from './toast-store'
import { esi } from '@/api/esi'
import { ESIMarketOrderSchema, ESICorporationMarketOrderSchema } from '@/api/schemas'
import { getTypeName } from '@/store/reference-cache'
import { useRegionalMarketStore } from '@/store/regional-market-store'
import { logger } from '@/lib/logger'
import { triggerResolution } from '@/lib/data-resolver'
import { z } from 'zod'

export type ESIMarketOrder = z.infer<typeof ESIMarketOrderSchema>
export type ESICorporationMarketOrder = z.infer<typeof ESICorporationMarketOrderSchema>
export type MarketOrder = ESIMarketOrder | ESICorporationMarketOrder

const ENDPOINT_PATTERN = '/orders/'
const DB_NAME = 'ecteveassets-market-orders-v2'
const OLD_DB_NAME = 'ecteveassets-market-orders'
const DB_VERSION = 1
const STORE_ORDERS = 'orders'
const STORE_VISIBILITY = 'visibility'

interface SourceOwner {
  type: OwnerType
  id: number
  characterId: number
}

export interface StoredOrder {
  order: MarketOrder
  sourceOwner: SourceOwner
}

export interface OwnerOrders {
  owner: Owner
  orders: MarketOrder[]
}

interface MarketOrdersState {
  ordersById: Map<number, StoredOrder>
  visibilityByOwner: Map<string, Set<number>>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
  updateCounter: number
}

interface MarketOrdersActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  getTotal: (selectedOwnerIds: string[]) => number
  getOrdersByOwner: () => OwnerOrders[]
}

type MarketOrdersStore = MarketOrdersState & MarketOrdersActions

function registerPricesFromOrders(ordersById: Map<number, StoredOrder>): void {
  const typeIds = new Set<number>()
  const regionIds = new Set<number>()
  const structuresByCharacter = new Map<number, { structureIds: Set<number>; typeIds: Set<number> }>()

  for (const { order, sourceOwner } of ordersById.values()) {
    typeIds.add(order.type_id)
    regionIds.add(order.region_id)

    if (!order.is_buy_order && order.location_id >= 1000000000000) {
      let entry = structuresByCharacter.get(sourceOwner.characterId)
      if (!entry) {
        entry = { structureIds: new Set(), typeIds: new Set() }
        structuresByCharacter.set(sourceOwner.characterId, entry)
      }
      entry.structureIds.add(order.location_id)
      entry.typeIds.add(order.type_id)
    }
  }

  if (typeIds.size > 0) {
    useRegionalMarketStore.getState().registerTypes(Array.from(typeIds), Array.from(regionIds))
  }

  for (const [characterId, { structureIds, typeIds: structureTypeIds }] of structuresByCharacter) {
    useRegionalMarketStore.getState().registerStructures(
      Array.from(structureIds),
      Array.from(structureTypeIds),
      characterId
    )
  }
}

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open market orders DB', request.error, { module: 'MarketOrdersStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_ORDERS)) {
        database.createObjectStore(STORE_ORDERS, { keyPath: 'orderId' })
      }
      if (!database.objectStoreNames.contains(STORE_VISIBILITY)) {
        database.createObjectStore(STORE_VISIBILITY, { keyPath: 'ownerKey' })
      }
    }
  })
}

interface StoredOrderRecord {
  orderId: number
  order: MarketOrder
  sourceOwner: SourceOwner
}

interface VisibilityRecord {
  ownerKey: string
  orderIds: number[]
}

async function loadFromDB(): Promise<{
  orders: Map<number, StoredOrder>
  visibility: Map<string, Set<number>>
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS, STORE_VISIBILITY], 'readonly')
    const ordersStore = tx.objectStore(STORE_ORDERS)
    const visibilityStore = tx.objectStore(STORE_VISIBILITY)

    const ordersRequest = ordersStore.getAll()
    const visibilityRequest = visibilityStore.getAll()

    tx.oncomplete = () => {
      const orders = new Map<number, StoredOrder>()
      for (const record of ordersRequest.result as StoredOrderRecord[]) {
        orders.set(record.orderId, {
          order: record.order,
          sourceOwner: record.sourceOwner,
        })
      }

      const visibility = new Map<string, Set<number>>()
      for (const record of visibilityRequest.result as VisibilityRecord[]) {
        visibility.set(record.ownerKey, new Set(record.orderIds))
      }

      resolve({ orders, visibility })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveVisibilityToDB(ownerKeyStr: string, orderIds: Set<number>): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_VISIBILITY], 'readwrite')
    const store = tx.objectStore(STORE_VISIBILITY)
    store.put({
      ownerKey: ownerKeyStr,
      orderIds: [...orderIds],
    } as VisibilityRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteVisibilityFromDB(ownerKeyStr: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_VISIBILITY], 'readwrite')
    const store = tx.objectStore(STORE_VISIBILITY)
    store.delete(ownerKeyStr)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteOrdersFromDB(orderIds: number[]): Promise<void> {
  if (orderIds.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS], 'readwrite')
    const store = tx.objectStore(STORE_ORDERS)
    for (const id of orderIds) {
      store.delete(id)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function saveOrdersToDB(orders: Array<{ orderId: number; stored: StoredOrder }>): Promise<void> {
  if (orders.length === 0) return
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS], 'readwrite')
    const store = tx.objectStore(STORE_ORDERS)
    for (const { orderId, stored } of orders) {
      store.put({
        orderId,
        order: stored.order,
        sourceOwner: stored.sourceOwner,
      } as StoredOrderRecord)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_ORDERS, STORE_VISIBILITY], 'readwrite')
    tx.objectStore(STORE_ORDERS).clear()
    tx.objectStore(STORE_VISIBILITY).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function migrateFromOldDB(): Promise<{
  orders: Map<number, StoredOrder>
  visibility: Map<string, Set<number>>
} | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(OLD_DB_NAME)

    request.onerror = () => {
      resolve(null)
    }

    request.onsuccess = () => {
      const oldDb = request.result
      if (!oldDb.objectStoreNames.contains('orders')) {
        oldDb.close()
        resolve(null)
        return
      }

      const tx = oldDb.transaction(['orders'], 'readonly')
      const store = tx.objectStore('orders')
      const getAllRequest = store.getAll()

      tx.oncomplete = async () => {
        const oldData = getAllRequest.result as Array<{
          key: string
          owner: Owner
          data: MarketOrder[]
        }>

        if (!oldData || oldData.length === 0) {
          oldDb.close()
          resolve(null)
          return
        }

        const orders = new Map<number, StoredOrder>()
        const visibility = new Map<string, Set<number>>()

        for (const entry of oldData) {
          if (!Array.isArray(entry.data)) continue

          const ownerKeyStr = ownerKey(entry.owner.type, entry.owner.id)
          const ownerVisibility = new Set<number>()

          for (const order of entry.data) {
            ownerVisibility.add(order.order_id)

            if (!orders.has(order.order_id)) {
              orders.set(order.order_id, {
                order,
                sourceOwner: {
                  type: entry.owner.type,
                  id: entry.owner.id,
                  characterId: entry.owner.characterId,
                },
              })
            }
          }

          visibility.set(ownerKeyStr, ownerVisibility)
        }

        oldDb.close()

        try {
          indexedDB.deleteDatabase(OLD_DB_NAME)
          logger.info('Migrated market orders from old DB format', {
            module: 'MarketOrdersStore',
            orders: orders.size,
            owners: visibility.size,
          })
        } catch {
          logger.warn('Failed to delete old market orders DB', { module: 'MarketOrdersStore' })
        }

        resolve({ orders, visibility })
      }

      tx.onerror = () => {
        oldDb.close()
        resolve(null)
      }
    }
  })
}

function getEndpoint(owner: Owner): string {
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/orders/`
    : `/characters/${owner.characterId}/orders/`
}

async function fetchOrdersForOwner(owner: Owner): Promise<{
  data: MarketOrder[]
  expiresAt: number
  etag: string | null
}> {
  const endpoint = getEndpoint(owner)

  if (owner.type === 'corporation') {
    return esi.fetchPaginatedWithMeta<ESICorporationMarketOrder>(endpoint, {
      characterId: owner.characterId,
      schema: ESICorporationMarketOrderSchema,
    })
  }

  const result = await esi.fetchPaginatedWithMeta<ESIMarketOrder>(endpoint, {
    characterId: owner.characterId,
    schema: ESIMarketOrderSchema,
  })
  result.data = result.data.filter((order) => !order.is_corporation)
  return result
}

export const useMarketOrdersStore = create<MarketOrdersStore>((set, get) => ({
  ordersById: new Map(),
  visibilityByOwner: new Map(),
  isUpdating: false,
  updateError: null,
  initialized: false,
  updateCounter: 0,

  init: async () => {
    if (get().initialized) return

    try {
      let { orders, visibility } = await loadFromDB()

      if (orders.size === 0) {
        const migrated = await migrateFromOldDB()
        if (migrated) {
          orders = migrated.orders
          visibility = migrated.visibility

          const orderBatch = Array.from(orders.entries()).map(([orderId, stored]) => ({ orderId, stored }))
          await saveOrdersToDB(orderBatch)
          for (const [ownerKeyStr, orderIds] of visibility) {
            await saveVisibilityToDB(ownerKeyStr, orderIds)
          }
        }
      }

      set((s) => ({
        ordersById: orders,
        visibilityByOwner: visibility,
        initialized: true,
        updateCounter: s.updateCounter + 1,
      }))

      if (orders.size > 0) {
        triggerResolution()
      }

      logger.info('Market orders store initialized', {
        module: 'MarketOrdersStore',
        orders: orders.size,
        owners: visibility.size,
      })

      get().update()
    } catch (err) {
      logger.error('Failed to load market orders from DB', err instanceof Error ? err : undefined, {
        module: 'MarketOrdersStore',
      })
      set({ initialized: true })
    }
  },

  update: async (force = false) => {
    const state = get()
    if (!state.initialized) {
      await get().init()
    }
    if (get().isUpdating) return

    const allOwners = Object.values(useAuthStore.getState().owners)
    if (allOwners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? allOwners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : allOwners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const key = `${owner.type}-${owner.id}`
          const endpoint = getEndpoint(owner)
          return expiryCacheStore.isExpired(key, endpoint)
        })

    if (ownersToUpdate.length === 0) return

    set({ isUpdating: true, updateError: null })

    try {
      const ordersById = new Map(get().ordersById)
      const visibilityByOwner = new Map(get().visibilityByOwner)
      const orderBatch: Array<{ orderId: number; stored: StoredOrder }> = []

      for (const owner of ownersToUpdate) {
        const currentOwnerKey = ownerKey(owner.type, owner.id)
        const endpoint = getEndpoint(owner)

        try {
          logger.info('Fetching market orders', { module: 'MarketOrdersStore', owner: owner.name })

          const { data: orders, expiresAt, etag } = await fetchOrdersForOwner(owner)

          const ownerVisibility = new Set<number>()

          for (const order of orders) {
            ownerVisibility.add(order.order_id)

            const stored: StoredOrder = {
              order,
              sourceOwner: { type: owner.type, id: owner.id, characterId: owner.characterId },
            }
            ordersById.set(order.order_id, stored)
            orderBatch.push({ orderId: order.order_id, stored })
          }

          visibilityByOwner.set(currentOwnerKey, ownerVisibility)
          await saveVisibilityToDB(currentOwnerKey, ownerVisibility)

          useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, orders.length === 0)
        } catch (err) {
          logger.error('Failed to fetch market orders', err instanceof Error ? err : undefined, {
            module: 'MarketOrdersStore',
            owner: owner.name,
          })
        }
      }

      await saveOrdersToDB(orderBatch)

      const visibleOrderIds = new Set<number>()
      for (const orderIds of visibilityByOwner.values()) {
        for (const id of orderIds) {
          visibleOrderIds.add(id)
        }
      }

      const staleOrderIds: number[] = []
      for (const orderId of ordersById.keys()) {
        if (!visibleOrderIds.has(orderId)) {
          staleOrderIds.push(orderId)
          ordersById.delete(orderId)
        }
      }

      if (staleOrderIds.length > 0) {
        await deleteOrdersFromDB(staleOrderIds)
        logger.info('Cleaned up stale orders', { module: 'MarketOrdersStore', count: staleOrderIds.length })
      }

      set((s) => ({
        ordersById,
        visibilityByOwner,
        isUpdating: false,
        updateError: ordersById.size === 0 ? 'Failed to fetch any market orders' : null,
        updateCounter: s.updateCounter + 1,
      }))

      triggerResolution()
      registerPricesFromOrders(ordersById)

      logger.info('Market orders updated', {
        module: 'MarketOrdersStore',
        owners: ownersToUpdate.length,
        totalOrders: ordersById.size,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Market orders update failed', err instanceof Error ? err : undefined, {
        module: 'MarketOrdersStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()
    if (!state.initialized) {
      await get().init()
    }

    try {
      const currentOwnerKey = ownerKey(owner.type, owner.id)
      const endpoint = getEndpoint(owner)

      const previousVisibility = state.visibilityByOwner.get(currentOwnerKey) ?? new Set()
      const previousOrders = new Map<number, MarketOrder>()
      for (const orderId of previousVisibility) {
        const stored = state.ordersById.get(orderId)
        if (stored) previousOrders.set(orderId, stored.order)
      }

      logger.info('Fetching market orders for owner', { module: 'MarketOrdersStore', owner: owner.name })

      const { data: orders, expiresAt, etag } = await fetchOrdersForOwner(owner)

      const ordersById = new Map(state.ordersById)
      const visibilityByOwner = new Map(state.visibilityByOwner)
      const orderBatch: Array<{ orderId: number; stored: StoredOrder }> = []

      const ownerVisibility = new Set<number>()

      for (const order of orders) {
        ownerVisibility.add(order.order_id)

        const stored: StoredOrder = {
          order,
          sourceOwner: { type: owner.type, id: owner.id, characterId: owner.characterId },
        }
        ordersById.set(order.order_id, stored)
        orderBatch.push({ orderId: order.order_id, stored })
      }

      await saveOrdersToDB(orderBatch)

      visibilityByOwner.set(currentOwnerKey, ownerVisibility)
      await saveVisibilityToDB(currentOwnerKey, ownerVisibility)

      const newOrderIds = new Set(orders.map((o) => o.order_id))
      const completedOrders = [...previousOrders.values()].filter((o) => !newOrderIds.has(o.order_id))

      if (completedOrders.length > 0) {
        const toastStore = useToastStore.getState()
        for (const order of completedOrders) {
          const typeName = getTypeName(order.type_id)
          const action = order.is_buy_order ? 'Buy' : 'Sell'
          toastStore.addToast(
            'order-filled',
            `${action} Order Filled`,
            `${order.volume_total.toLocaleString()}x ${typeName}`
          )
        }
        logger.info('Market orders completed', {
          module: 'MarketOrdersStore',
          owner: owner.name,
          count: completedOrders.length,
        })
      }

      const visibleOrderIds = new Set<number>()
      for (const orderIds of visibilityByOwner.values()) {
        for (const id of orderIds) {
          visibleOrderIds.add(id)
        }
      }

      const staleOrderIds: number[] = []
      for (const orderId of ordersById.keys()) {
        if (!visibleOrderIds.has(orderId)) {
          staleOrderIds.push(orderId)
          ordersById.delete(orderId)
        }
      }

      if (staleOrderIds.length > 0) {
        await deleteOrdersFromDB(staleOrderIds)

        const remainingTypeIds = new Set<number>()
        const remainingStructureIds = new Set<number>()
        for (const { order } of ordersById.values()) {
          remainingTypeIds.add(order.type_id)
          if (!order.is_buy_order && order.location_id >= 1000000000000) {
            remainingStructureIds.add(order.location_id)
          }
        }

        const typesToUntrack = completedOrders
          .map((o) => o.type_id)
          .filter((typeId) => !remainingTypeIds.has(typeId))

        if (typesToUntrack.length > 0) {
          useRegionalMarketStore.getState().untrackTypes(typesToUntrack)
        }

        const structuresToUntrack = completedOrders
          .filter((o) => !o.is_buy_order && o.location_id >= 1000000000000)
          .map((o) => o.location_id)
          .filter((locId) => !remainingStructureIds.has(locId))

        if (structuresToUntrack.length > 0) {
          useRegionalMarketStore.getState().untrackStructures(structuresToUntrack)
        }

        logger.info('Cleaned up stale orders', { module: 'MarketOrdersStore', count: staleOrderIds.length })
      }

      useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, orders.length === 0)

      set((s) => ({
        ordersById,
        visibilityByOwner,
        updateCounter: s.updateCounter + 1,
      }))

      triggerResolution()
      registerPricesFromOrders(ordersById)

      logger.info('Market orders updated for owner', {
        module: 'MarketOrdersStore',
        owner: owner.name,
        orders: orders.length,
      })
    } catch (err) {
      logger.error('Failed to fetch market orders for owner', err instanceof Error ? err : undefined, {
        module: 'MarketOrdersStore',
        owner: owner.name,
      })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const currentOwnerKey = `${ownerType}-${ownerId}`

    if (!state.visibilityByOwner.has(currentOwnerKey)) return

    const visibilityByOwner = new Map(state.visibilityByOwner)
    visibilityByOwner.delete(currentOwnerKey)

    await deleteVisibilityFromDB(currentOwnerKey)

    const visibleOrderIds = new Set<number>()
    for (const orderIds of visibilityByOwner.values()) {
      for (const id of orderIds) {
        visibleOrderIds.add(id)
      }
    }

    const ordersById = new Map(state.ordersById)
    const staleOrderIds: number[] = []
    for (const orderId of ordersById.keys()) {
      if (!visibleOrderIds.has(orderId)) {
        staleOrderIds.push(orderId)
        ordersById.delete(orderId)
      }
    }

    if (staleOrderIds.length > 0) {
      await deleteOrdersFromDB(staleOrderIds)
    }

    set({ ordersById, visibilityByOwner })

    useExpiryCacheStore.getState().clearForOwner(currentOwnerKey)

    logger.info('Market orders removed for owner', {
      module: 'MarketOrdersStore',
      ownerKey: currentOwnerKey,
      staleOrdersRemoved: staleOrderIds.length,
    })
  },

  clear: async () => {
    await clearDB()
    set({
      ordersById: new Map(),
      visibilityByOwner: new Map(),
      updateError: null,
      initialized: false,
    })
  },

  getTotal: (selectedOwnerIds) => {
    const state = get()
    const selectedSet = new Set(selectedOwnerIds)
    const regionalStore = useRegionalMarketStore.getState()

    const visibleOrderIds = new Set<number>()
    for (const [key, orderIds] of state.visibilityByOwner) {
      if (selectedSet.has(key)) {
        for (const id of orderIds) {
          visibleOrderIds.add(id)
        }
      }
    }

    let total = 0
    for (const orderId of visibleOrderIds) {
      const stored = state.ordersById.get(orderId)
      if (!stored) continue

      const { order } = stored
      if (order.is_buy_order) {
        total += order.escrow ?? 0
      } else {
        total += (regionalStore.getPrice(order.type_id) ?? 0) * order.volume_remain
      }
    }
    return total
  },

  getOrdersByOwner: () => {
    const state = get()
    const result: OwnerOrders[] = []

    for (const [ownerKeyStr, orderIds] of state.visibilityByOwner) {
      const owner = findOwnerByKey(ownerKeyStr)
      if (!owner) continue

      const orders: MarketOrder[] = []
      for (const orderId of orderIds) {
        const stored = state.ordersById.get(orderId)
        if (stored) {
          orders.push(stored.order)
        }
      }

      result.push({ owner, orders })
    }

    return result
  },
}))

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'MarketOrdersStore', ownerKey: ownerKeyStr })
    return
  }
  await useMarketOrdersStore.getState().updateForOwner(owner)
})
