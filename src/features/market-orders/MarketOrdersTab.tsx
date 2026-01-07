import { useEffect, useMemo, useState } from 'react'
import { matchesSearchLower } from '@/lib/utils'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls, type OrderTypeValue } from '@/context'
import { useColumnSettings } from '@/hooks'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { useRegionalMarketStore } from '@/store/regional-market-store'
import { getEsiAveragePrice } from '@/store/price-store'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { getLocationInfo } from '@/lib/location-utils'
import { ORDER_COLUMNS, type OrderRow } from './types'
import { OrdersTable } from './OrdersTable'

const CONTAINER_CLASS =
  'h-full rounded-lg border border-border bg-surface-secondary/30'

export function MarketOrdersTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const itemsById = useMarketOrdersStore((s) => s.itemsById)
  const visibilityByOwner = useMarketOrdersStore((s) => s.visibilityByOwner)
  const ordersUpdating = useMarketOrdersStore((s) => s.isUpdating)
  const updateError = useMarketOrdersStore((s) => s.updateError)
  const init = useMarketOrdersStore((s) => s.init)
  const initialized = useMarketOrdersStore((s) => s.initialized)

  const ordersByOwner = useMemo(
    () =>
      useMarketOrdersStore.getOrdersByOwner({ itemsById, visibilityByOwner }),
    [itemsById, visibilityByOwner]
  )

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || ordersUpdating

  useEffect(() => {
    init()
  }, [init])

  const types = useReferenceCacheStore((s) => s.types)
  const structures = useReferenceCacheStore((s) => s.structures)

  const regionalMarketStore = useRegionalMarketStore()

  const { search, setTotalValue, setColumns, setOrderTypeFilter } =
    useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const [orderTypeValue, setOrderTypeValue] = useState<OrderTypeValue>('all')

  const { getColumnsForDropdown, getVisibleColumns } = useColumnSettings(
    'market-orders',
    ORDER_COLUMNS
  )
  const visibleColumns = useMemo(
    () => new Set(getVisibleColumns()),
    [getVisibleColumns]
  )

  const allOrders = useMemo(() => {
    void structures

    const filteredOrdersByOwner = ordersByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    const orders: OrderRow[] = []

    for (const { owner, orders: ownerOrders } of filteredOrdersByOwner) {
      for (const order of ownerOrders) {
        const type = types.get(order.type_id)
        const locationInfo = getLocationInfo(order.location_id)
        const lowestSell =
          regionalMarketStore.getPriceAtLocation(
            order.type_id,
            order.location_id
          ) ?? null
        const highestBuy =
          regionalMarketStore.getHighestBuyAtLocation(
            order.type_id,
            order.location_id
          ) ?? null
        const eveEstimated = getEsiAveragePrice(order.type_id) ?? null
        const expiryTime =
          new Date(order.issued).getTime() +
          order.duration * 24 * 60 * 60 * 1000

        orders.push({
          order,
          ownerId: owner.id,
          ownerType: owner.type,
          ownerName: owner.name,
          typeId: order.type_id,
          typeName: type?.name ?? `Unknown Type ${order.type_id}`,
          categoryId: type?.categoryId,
          locationId: order.location_id,
          locationName: locationInfo.name,
          regionName: locationInfo.regionName,
          systemName: locationInfo.systemName,
          lowestSell,
          highestBuy,
          eveEstimated,
          expiryTime,
        })
      }
    }

    return orders
  }, [ordersByOwner, types, structures, selectedSet, regionalMarketStore])

  const filteredOrders = useMemo(() => {
    let filtered = allOrders

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((o) =>
        matchesSearchLower(
          searchLower,
          o.typeName,
          o.ownerName,
          o.locationName,
          o.regionName,
          o.systemName
        )
      )
    }

    if (orderTypeValue === 'sell')
      return filtered.filter((o) => !o.order.is_buy_order)
    if (orderTypeValue === 'buy')
      return filtered.filter((o) => o.order.is_buy_order)
    return filtered
  }, [allOrders, search, orderTypeValue])

  const totals = useMemo(() => {
    let sellValue = 0
    let buyValue = 0

    for (const row of filteredOrders) {
      if (row.order.is_buy_order) {
        buyValue += row.order.price * row.order.volume_remain
      } else {
        const price = row.lowestSell ?? row.order.price
        sellValue += price * row.order.volume_remain
      }
    }

    return { sellValue, buyValue }
  }, [filteredOrders])

  useEffect(() => {
    setOrderTypeFilter({
      value: orderTypeValue,
      onChange: setOrderTypeValue,
    })
    return () => setOrderTypeFilter(null)
  }, [orderTypeValue, setOrderTypeFilter])

  useEffect(() => {
    setTotalValue({
      value: totals.sellValue,
      label: 'Sell Orders',
      secondaryValue: totals.buyValue,
      secondaryLabel: 'Buy Orders',
    })
    return () => setTotalValue(null)
  }, [totals.sellValue, totals.buyValue, setTotalValue])

  useEffect(() => {
    setColumns(getColumnsForDropdown())
    return () => setColumns([])
  }, [getColumnsForDropdown, setColumns])

  const loadingState = TabLoadingState({
    dataType: 'market orders',
    initialized,
    isUpdating,
    hasData: ordersByOwner.length > 0,
    hasOwners: owners.length > 0,
    updateError,
  })
  if (loadingState) return loadingState

  if (filteredOrders.length === 0) {
    return (
      <div className={`${CONTAINER_CLASS} flex items-center justify-center`}>
        <p className="text-content-secondary">No market orders.</p>
      </div>
    )
  }

  return (
    <div className={`${CONTAINER_CLASS} overflow-auto`}>
      <OrdersTable orders={filteredOrders} visibleColumns={visibleColumns} />
    </div>
  )
}
