import type { StoreApi, UseBoundStore } from 'zustand'
import { type Owner, findOwnerByKey } from './auth-store'
import { usePriceStore } from './price-store'
import { esi } from '@/api/esi'
import {
  ESIMarketOrderSchema,
  ESICorporationMarketOrderSchema,
} from '@/api/schemas'
import { useRegionalMarketStore } from '@/store/regional-market-store'
import { logger } from '@/lib/logger'
import {
  createVisibilityStore,
  type StoredItem,
  type SourceOwner,
  type VisibilityStore,
} from './create-visibility-store'
import { z } from 'zod'

export type ESIMarketOrder = z.infer<typeof ESIMarketOrderSchema>
export type ESICorporationMarketOrder = z.infer<
  typeof ESICorporationMarketOrderSchema
>
export type MarketOrder = ESIMarketOrder | ESICorporationMarketOrder

export interface StoredOrder extends StoredItem<MarketOrder> {
  item: MarketOrder
  sourceOwner: SourceOwner
}

export interface OwnerOrders {
  owner: Owner
  orders: MarketOrder[]
}

interface MarketOrdersExtras {
  getTotal: (
    selectedOwnerIds: string[],
    state?: {
      itemsById: Map<number, StoredOrder>
      visibilityByOwner: Map<string, Set<number>>
    }
  ) => number
  getOrdersByOwner: (state?: {
    itemsById: Map<number, StoredOrder>
    visibilityByOwner: Map<string, Set<number>>
  }) => OwnerOrders[]
}

export type MarketOrdersStore = UseBoundStore<
  StoreApi<VisibilityStore<StoredOrder>>
> &
  MarketOrdersExtras

function registerPricesFromOrders(ordersById: Map<number, StoredOrder>): void {
  const typeIds = new Set<number>()
  const regionIds = new Set<number>()
  const structuresByCharacter = new Map<
    number,
    { structureIds: Set<number>; typeIds: Set<number> }
  >()

  for (const { item: order, sourceOwner } of ordersById.values()) {
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
    useRegionalMarketStore
      .getState()
      .registerTypes(Array.from(typeIds), Array.from(regionIds))
  }

  for (const [
    characterId,
    { structureIds, typeIds: structureTypeIds },
  ] of structuresByCharacter) {
    useRegionalMarketStore
      .getState()
      .registerStructures(
        Array.from(structureIds),
        Array.from(structureTypeIds),
        characterId
      )
  }
}

function getEndpoint(owner: Owner): string {
  return owner.type === 'corporation'
    ? `/corporations/${owner.id}/orders`
    : `/characters/${owner.characterId}/orders`
}

const previousOrdersByOwner = new Map<string, Map<number, MarketOrder>>()

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

const baseStore = createVisibilityStore<MarketOrder, StoredOrder>({
  name: 'market orders',
  moduleName: 'MarketOrdersStore',
  endpointPattern: '/orders',
  dbName: 'ecteveassets-market-orders-v2',
  itemStoreName: 'orders',
  itemKeyName: 'orderId',
  getEndpoint,
  getItemId: (order) => order.order_id,
  fetchData: fetchOrdersForOwner,
  toStoredItem: (owner, order) => ({
    item: order,
    sourceOwner: {
      type: owner.type,
      id: owner.id,
      characterId: owner.characterId,
    },
  }),
  onAfterInit: (itemsById) => {
    registerPricesFromOrders(itemsById)

    const activeTypeIds = new Set<number>()
    for (const { item } of itemsById.values()) {
      activeTypeIds.add(item.type_id)
    }
    useRegionalMarketStore.getState().syncTypesWithOrders(activeTypeIds)
  },
  onBeforeOwnerUpdate: (owner, previousVisibility, itemsById) => {
    const ownerKey = `${owner.type}:${owner.id}`
    const previousOrders = new Map<number, MarketOrder>()
    for (const orderId of previousVisibility) {
      const stored = itemsById.get(orderId)
      if (stored) previousOrders.set(orderId, stored.item)
    }
    previousOrdersByOwner.set(ownerKey, previousOrders)
  },
  onAfterOwnerUpdate: ({ owner, newItems, itemsById }) => {
    const ownerKey = `${owner.type}:${owner.id}`
    const previousOrders = previousOrdersByOwner.get(ownerKey) ?? new Map()
    previousOrdersByOwner.delete(ownerKey)

    const newOrderIds = new Set(newItems.map((o) => o.order_id))
    const completedOrders = [...previousOrders.values()].filter(
      (o) => !newOrderIds.has(o.order_id)
    )

    if (completedOrders.length > 0) {
      logger.info('Market orders completed', {
        module: 'MarketOrdersStore',
        owner: owner.name,
        count: completedOrders.length,
      })

      const remainingTypeIds = new Set<number>()
      const remainingStructureIds = new Set<number>()
      for (const { item: o } of itemsById.values()) {
        remainingTypeIds.add(o.type_id)
        if (!o.is_buy_order && o.location_id >= 1000000000000) {
          remainingStructureIds.add(o.location_id)
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
    }

    registerPricesFromOrders(itemsById)
  },
  onAfterBatchUpdate: registerPricesFromOrders,
})

export const useMarketOrdersStore: MarketOrdersStore = Object.assign(
  baseStore,
  {
    getTotal(
      selectedOwnerIds: string[],
      stateOverride?: {
        itemsById: Map<number, StoredOrder>
        visibilityByOwner: Map<string, Set<number>>
      }
    ): number {
      const { itemsById, visibilityByOwner } =
        stateOverride ?? baseStore.getState()
      const selectedSet = new Set(selectedOwnerIds)

      const visibleOrderIds = new Set<number>()
      for (const [key, orderIds] of visibilityByOwner) {
        if (selectedSet.has(key)) {
          for (const id of orderIds) visibleOrderIds.add(id)
        }
      }

      const priceStore = usePriceStore.getState()
      let total = 0
      for (const orderId of visibleOrderIds) {
        const stored = itemsById.get(orderId)
        if (!stored) continue

        const { item: order } = stored
        if (order.is_buy_order) {
          total += order.escrow ?? 0
        } else {
          total += priceStore.getItemPrice(order.type_id) * order.volume_remain
        }
      }
      return total
    },

    getOrdersByOwner(stateOverride?: {
      itemsById: Map<number, StoredOrder>
      visibilityByOwner: Map<string, Set<number>>
    }): OwnerOrders[] {
      const { itemsById, visibilityByOwner } =
        stateOverride ?? baseStore.getState()
      const result: OwnerOrders[] = []

      for (const [ownerKeyStr, orderIds] of visibilityByOwner) {
        const owner = findOwnerByKey(ownerKeyStr)
        if (!owner) continue

        const orders: MarketOrder[] = []
        for (const orderId of orderIds) {
          const stored = itemsById.get(orderId)
          if (stored) orders.push(stored.item)
        }

        result.push({ owner, orders })
      }

      return result
    },
  }
)
