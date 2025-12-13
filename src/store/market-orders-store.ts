import { create } from 'zustand'
import { useAuthStore, type Owner, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { useToastStore } from './toast-store'
import { esi, type ESIResponseMeta } from '@/api/esi'
import {
  ESIMarketOrderSchema,
  ESICorporationMarketOrderSchema,
} from '@/api/schemas'
import { getTypeName } from '@/store/reference-cache'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

const ENDPOINT_PATTERN = '/orders/'

export type ESIMarketOrder = z.infer<typeof ESIMarketOrderSchema>
export type ESICorporationMarketOrder = z.infer<typeof ESICorporationMarketOrderSchema>
export type MarketOrder = ESIMarketOrder | ESICorporationMarketOrder

export interface OwnerOrders {
  owner: Owner
  orders: MarketOrder[]
}

interface MarketOrdersState {
  ordersByOwner: OwnerOrders[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface MarketOrdersActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type MarketOrdersStore = MarketOrdersState & MarketOrdersActions

const db = createOwnerDB<MarketOrder[]>({
  dbName: 'ecteveassets-market-orders',
  storeName: 'orders',
  dataKey: 'orders',
  metaStoreName: 'meta',
  version: 2,
  moduleName: 'MarketOrdersStore',
})

function getOrdersEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/orders/`
  }
  return `/characters/${owner.characterId}/orders/`
}

async function fetchOwnerOrdersWithMeta(owner: Owner): Promise<ESIResponseMeta<MarketOrder[]>> {
  const endpoint = getOrdersEndpoint(owner)
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
  ordersByOwner: [],
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const ordersByOwner = loaded.map((d) => ({ owner: d.owner, orders: d.data }))
      set({ ordersByOwner, initialized: true })
      logger.info('Market orders store initialized', {
        module: 'MarketOrdersStore',
        owners: ordersByOwner.length,
        orders: ordersByOwner.reduce((sum, o) => sum + o.orders.length, 0),
      })
    } catch (err) {
      logger.error('Failed to load market orders from DB', err instanceof Error ? err : undefined, {
        module: 'MarketOrdersStore',
      })
      set({ initialized: true })
    }
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? owners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : owners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getOrdersEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need market orders update', { module: 'MarketOrdersStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingOrders = new Map(
        state.ordersByOwner.map((oo) => [`${oo.owner.type}-${oo.owner.id}`, oo])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getOrdersEndpoint(owner)

        try {
          logger.info('Fetching market orders', { module: 'MarketOrdersStore', owner: owner.name })
          const { data: orders, expiresAt, etag } = await fetchOwnerOrdersWithMeta(owner)

          await db.save(ownerKey, owner, orders)
          existingOrders.set(ownerKey, { owner, orders })

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag, orders.length === 0)
        } catch (err) {
          logger.error('Failed to fetch market orders', err instanceof Error ? err : undefined, {
            module: 'MarketOrdersStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingOrders.values())

      set({
        ordersByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any orders' : null,
      })

      logger.info('Market orders updated', {
        module: 'MarketOrdersStore',
        owners: ownersToUpdate.length,
        totalOrders: results.reduce((sum, r) => sum + r.orders.length, 0),
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

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getOrdersEndpoint(owner)

      const previousOrders = state.ordersByOwner.find(
        (oo) => `${oo.owner.type}-${oo.owner.id}` === ownerKey
      )?.orders ?? []
      const previousOrderIds = new Set(previousOrders.map((o) => o.order_id))

      logger.info('Fetching market orders for owner', { module: 'MarketOrdersStore', owner: owner.name })
      const { data: orders, expiresAt, etag } = await fetchOwnerOrdersWithMeta(owner)

      const newOrderIds = new Set(orders.map((o) => o.order_id))
      const completedOrders = previousOrders.filter((o) => !newOrderIds.has(o.order_id))

      if (completedOrders.length > 0 && previousOrderIds.size > 0) {
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

      await db.save(ownerKey, owner, orders)
      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag, orders.length === 0)

      const updated = state.ordersByOwner.filter(
        (oo) => `${oo.owner.type}-${oo.owner.id}` !== ownerKey
      )
      updated.push({ owner, orders })

      set({ ordersByOwner: updated })

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
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.ordersByOwner.filter(
      (oo) => `${oo.owner.type}-${oo.owner.id}` !== ownerKey
    )

    if (updated.length === state.ordersByOwner.length) return

    await db.delete(ownerKey)
    set({ ordersByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Market orders removed for owner', { module: 'MarketOrdersStore', ownerKey })
  },

  clear: async () => {
    await db.clear()
    set({
      ordersByOwner: [],
      updateError: null,
      initialized: false,
    })
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
