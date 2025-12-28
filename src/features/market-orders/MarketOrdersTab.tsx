import { useEffect, useMemo, useState } from 'react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import { useColumnSettings } from '@/hooks'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { useRegionalMarketStore } from '@/store/regional-market-store'
import { getEsiAveragePrice } from '@/store/price-store'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import { formatNumber } from '@/lib/utils'
import { getLocationInfo } from '@/lib/location-utils'
import { ORDER_TYPE_OPTIONS, ORDER_COLUMNS, type OrderRow } from './types'
import { OrdersTable } from './OrdersTable'

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

  const { search, setResultCount, setTotalValue, setColumns } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const [locationFilter, setLocationFilter] = useState<Set<string>>(new Set())
  const [orderTypeFilter, setOrderTypeFilter] = useState<
    'all' | 'sell' | 'buy'
  >('all')

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

  const availableLocations = useMemo(() => {
    const locationMap = new Map<number, string>()
    for (const order of allOrders) {
      if (!locationMap.has(order.locationId)) {
        locationMap.set(order.locationId, order.locationName)
      }
    }
    return Array.from(locationMap.entries())
      .map(([id, name]) => ({ value: String(id), label: name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allOrders])

  useEffect(() => {
    if (locationFilter.size > 0) {
      const validLocations = new Set(availableLocations.map((l) => l.value))
      const validFilters = new Set(
        [...locationFilter].filter((f) => validLocations.has(f))
      )
      if (validFilters.size !== locationFilter.size) {
        setLocationFilter(validFilters)
      }
    }
  }, [availableLocations, locationFilter])

  const filteredOrders = useMemo(() => {
    let filtered = allOrders

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (o) =>
          o.typeName.toLowerCase().includes(searchLower) ||
          o.ownerName.toLowerCase().includes(searchLower) ||
          o.locationName.toLowerCase().includes(searchLower) ||
          o.regionName.toLowerCase().includes(searchLower) ||
          o.systemName.toLowerCase().includes(searchLower)
      )
    }

    if (locationFilter.size > 0) {
      filtered = filtered.filter((o) =>
        locationFilter.has(String(o.locationId))
      )
    }

    if (orderTypeFilter === 'sell')
      return filtered.filter((o) => !o.order.is_buy_order)
    if (orderTypeFilter === 'buy')
      return filtered.filter((o) => o.order.is_buy_order)
    return filtered
  }, [allOrders, search, locationFilter, orderTypeFilter])

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

    return { sellValue, buyValue, totalCount: filteredOrders.length }
  }, [filteredOrders])

  const totalOrderCount = useMemo(() => {
    let count = 0
    for (const { orders } of ordersByOwner) {
      count += orders.length
    }
    return count
  }, [ordersByOwner])

  useEffect(() => {
    setResultCount({ showing: totals.totalCount, total: totalOrderCount })
    return () => setResultCount(null)
  }, [totals.totalCount, totalOrderCount, setResultCount])

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

  const headerLabel =
    orderTypeFilter === 'sell'
      ? 'Sell Orders'
      : orderTypeFilter === 'buy'
        ? 'Buy Orders'
        : 'Market Orders'

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-2 mb-3">
        <select
          value={orderTypeFilter}
          onChange={(e) =>
            setOrderTypeFilter(e.target.value as 'all' | 'sell' | 'buy')
          }
          className="px-2 py-1 text-sm rounded border border-border bg-surface hover:bg-surface-secondary transition-colors"
        >
          {ORDER_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {availableLocations.length > 1 && (
          <MultiSelectDropdown
            options={availableLocations}
            selected={locationFilter}
            onChange={setLocationFilter}
            placeholder="All Locations"
          />
        )}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-content-secondary">
            No {headerLabel.toLowerCase()}.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface-secondary/30">
          <div className="px-4 py-2 border-b border-border bg-surface-secondary/50 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-content-secondary">
              {headerLabel}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-content-muted">
                {filteredOrders.length} order
                {filteredOrders.length !== 1 ? 's' : ''}
              </span>
              <span className="text-status-highlight tabular-nums">
                {formatNumber(totals.sellValue + totals.buyValue)}
              </span>
            </div>
          </div>
          <OrdersTable
            orders={filteredOrders}
            visibleColumns={visibleColumns}
          />
        </div>
      )}
    </div>
  )
}
