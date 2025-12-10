import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, TrendingUp, TrendingDown, ChevronRight, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import { type ESIMarketOrder } from '@/api/endpoints/market'
import {
  hasType,
  getType,
  hasLocation,
  getLocation,
  hasStructure,
  getStructure,
  subscribe,
} from '@/store/reference-cache'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import { resolveStructures } from '@/api/endpoints/universe'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TypeIcon } from '@/components/ui/type-icon'

interface OrderRow {
  order: ESIMarketOrder
  ownerName: string
  typeId: number
  typeName: string
  categoryId?: number
  locationName: string
  regionName: string
  systemName: string
}

interface LocationGroup {
  locationId: number
  locationName: string
  regionName: string
  systemName: string
  orders: OrderRow[]
  totalBuyValue: number
  totalSellValue: number
}

function formatISK(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B'
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M'
  if (value >= 1_000) return (value / 1_000).toFixed(2) + 'K'
  return value.toLocaleString()
}

function formatExpiry(issued: string, duration: number): string {
  const issuedDate = new Date(issued)
  const expiryDate = new Date(issuedDate.getTime() + duration * 24 * 60 * 60 * 1000)
  const now = Date.now()
  const remaining = expiryDate.getTime() - now

  if (remaining <= 0) return 'Expired'

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  if (days > 0) return `${days}d`

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  return `${hours}h`
}

function OrdersTable({ orders }: { orders: OrderRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8"></TableHead>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Expires</TableHead>
          <TableHead>Owner</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((row) => {
          const total = row.order.price * row.order.volume_remain
          return (
            <TableRow key={row.order.order_id}>
              <TableCell className="py-1.5 w-8">
                {row.order.is_buy_order ? (
                  <TrendingDown className="h-4 w-4 text-green-400" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-red-400" />
                )}
              </TableCell>
              <TableCell className="py-1.5">
                <div className="flex items-center gap-2">
                  <TypeIcon typeId={row.typeId} categoryId={row.categoryId} />
                  <span className="truncate" title={row.typeName}>
                    {row.typeName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums">
                {formatISK(row.order.price)}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums">
                {row.order.volume_remain.toLocaleString()}
                {row.order.volume_remain !== row.order.volume_total && (
                  <span className="text-slate-500">
                    /{row.order.volume_total.toLocaleString()}
                  </span>
                )}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums text-amber-400">
                {formatISK(total)}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums text-slate-400">
                {formatExpiry(row.order.issued, row.order.duration)}
              </TableCell>
              <TableCell className="py-1.5 text-slate-400">{row.ownerName}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function LocationGroupRow({
  group,
  isExpanded,
  onToggle,
}: {
  group: LocationGroup
  isExpanded: boolean
  onToggle: () => void
}) {
  const buyOrders = group.orders.filter((o) => o.order.is_buy_order)
  const sellOrders = group.orders.filter((o) => !o.order.is_buy_order)

  return (
    <div className="border-b border-slate-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800/50 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <span className="font-medium text-blue-300 flex-1">{group.locationName}</span>
        <span className="text-xs text-slate-500 mr-4">
          {group.systemName} / {group.regionName}
        </span>
        <span className="text-xs text-green-400 w-24 text-right">
          {buyOrders.length > 0 && `${buyOrders.length} buy`}
        </span>
        <span className="text-xs text-red-400 w-24 text-right">
          {sellOrders.length > 0 && `${sellOrders.length} sell`}
        </span>
        <span className="text-xs text-amber-400 w-28 text-right tabular-nums">
          {formatISK(group.totalBuyValue + group.totalSellValue)}
        </span>
      </button>
      {isExpanded && (
        <div className="bg-slate-900/30 px-3 pb-2">
          <OrdersTable orders={group.orders} />
        </div>
      )}
    </div>
  )
}

export function MarketOrdersTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const ordersByOwner = useMarketOrdersStore((s) => s.ordersByOwner)
  const ordersLastUpdated = useMarketOrdersStore((s) => s.lastUpdated)
  const ordersUpdating = useMarketOrdersStore((s) => s.isUpdating)
  const updateError = useMarketOrdersStore((s) => s.updateError)
  const init = useMarketOrdersStore((s) => s.init)
  const initialized = useMarketOrdersStore((s) => s.initialized)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || ordersUpdating

  useEffect(() => {
    init()
  }, [init])

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => subscribe(() => setCacheVersion((v) => v + 1)), [])

  useEffect(() => {
    if (ordersByOwner.length === 0) return

    const unresolvedTypeIds = new Set<number>()
    const unknownLocationIds = new Set<number>()
    const structureToCharacter = new Map<number, number>()

    for (const { owner, orders } of ordersByOwner) {
      for (const order of orders) {
        const type = getType(order.type_id)
        if (!type || type.name.startsWith('Unknown Type ')) {
          unresolvedTypeIds.add(order.type_id)
        }
        if (order.location_id > 1_000_000_000_000) {
          if (!hasStructure(order.location_id)) {
            structureToCharacter.set(order.location_id, owner.characterId)
          }
        } else if (!hasLocation(order.location_id)) {
          unknownLocationIds.add(order.location_id)
        }
      }
    }

    if (unresolvedTypeIds.size > 0) {
      resolveTypes(Array.from(unresolvedTypeIds)).catch(() => {})
    }
    if (unknownLocationIds.size > 0) {
      resolveLocations(Array.from(unknownLocationIds)).catch(() => {})
    }
    if (structureToCharacter.size > 0) {
      resolveStructures(structureToCharacter).catch(() => {})
    }
  }, [ordersByOwner])

  const [expandedLocations, setExpandedLocations] = useState<Set<number>>(new Set())

  const locationGroups = useMemo(() => {
    void cacheVersion

    const getLocationInfo = (locationId: number) => {
      if (locationId > 1_000_000_000_000) {
        const structure = hasStructure(locationId) ? getStructure(locationId) : undefined
        return {
          name: structure?.name ?? `Structure ${locationId}`,
          regionName: '',
          systemName: '',
        }
      }
      const location = hasLocation(locationId) ? getLocation(locationId) : undefined
      return {
        name: location?.name ?? `Location ${locationId}`,
        regionName: location?.regionName ?? '',
        systemName: location?.solarSystemName ?? '',
      }
    }

    const groups = new Map<number, LocationGroup>()

    for (const { owner, orders } of ordersByOwner) {
      for (const order of orders) {
        const type = hasType(order.type_id) ? getType(order.type_id) : undefined
        const locationInfo = getLocationInfo(order.location_id)

        const row: OrderRow = {
          order,
          ownerName: owner.name,
          typeId: order.type_id,
          typeName: type?.name ?? `Unknown Type ${order.type_id}`,
          categoryId: type?.categoryId,
          locationName: locationInfo.name,
          regionName: locationInfo.regionName,
          systemName: locationInfo.systemName,
        }

        let group = groups.get(order.location_id)
        if (!group) {
          group = {
            locationId: order.location_id,
            locationName: row.locationName,
            regionName: row.regionName,
            systemName: row.systemName,
            orders: [],
            totalBuyValue: 0,
            totalSellValue: 0,
          }
          groups.set(order.location_id, group)
        }

        group.orders.push(row)
        const orderValue = order.price * order.volume_remain
        if (order.is_buy_order) {
          group.totalBuyValue += orderValue
        } else {
          group.totalSellValue += orderValue
        }
      }
    }

    const sorted = Array.from(groups.values()).sort((a, b) => {
      const aTotal = a.totalBuyValue + a.totalSellValue
      const bTotal = b.totalBuyValue + b.totalSellValue
      return bTotal - aTotal
    })

    for (const group of sorted) {
      group.orders.sort((a, b) => {
        if (a.order.is_buy_order !== b.order.is_buy_order) {
          return a.order.is_buy_order ? 1 : -1
        }
        return b.order.price * b.order.volume_remain - a.order.price * a.order.volume_remain
      })
    }

    return sorted
  }, [ordersByOwner, cacheVersion])

  const toggleLocation = useCallback((locationId: number) => {
    setExpandedLocations((prev) => {
      const next = new Set(prev)
      if (next.has(locationId)) next.delete(locationId)
      else next.add(locationId)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allIds = locationGroups.map((g) => g.locationId)
    setExpandedLocations(new Set(allIds))
  }, [locationGroups])

  const collapseAll = useCallback(() => {
    setExpandedLocations(new Set())
  }, [])

  const { setExpandCollapse } = useTabControls()

  const expandableIds = useMemo(() => locationGroups.map((g) => g.locationId), [locationGroups])
  const isAllExpanded = expandableIds.length > 0 && expandableIds.every((id) => expandedLocations.has(id))

  useEffect(() => {
    if (expandableIds.length === 0) {
      setExpandCollapse(null)
      return
    }

    setExpandCollapse({
      isExpanded: isAllExpanded,
      toggle: () => {
        if (isAllExpanded) {
          collapseAll()
        } else {
          expandAll()
        }
      },
    })

    return () => setExpandCollapse(null)
  }, [expandableIds, isAllExpanded, expandAll, collapseAll, setExpandCollapse])

  const totals = useMemo(() => {
    let buyValue = 0
    let sellValue = 0
    let buyCount = 0
    let sellCount = 0

    for (const group of locationGroups) {
      buyValue += group.totalBuyValue
      sellValue += group.totalSellValue
      for (const row of group.orders) {
        if (row.order.is_buy_order) buyCount++
        else sellCount++
      }
    }

    return { buyValue, sellValue, buyCount, sellCount }
  }, [locationGroups])

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No characters logged in. Add a character to view orders.</p>
      </div>
    )
  }

  if (!initialized || (isUpdating && ordersByOwner.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">Loading market orders...</p>
        </div>
      </div>
    )
  }

  if (ordersByOwner.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {updateError && (
            <>
              <p className="text-red-500">Failed to load market orders</p>
              <p className="text-sm text-slate-400 mb-4">{updateError}</p>
            </>
          )}
          {!updateError && (
            <p className="text-slate-400">No market orders loaded. Use the Update button in the header to fetch from ESI.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-slate-400">Buy Orders: </span>
          <span className="font-medium text-green-400">{totals.buyCount}</span>
          <span className="text-slate-500 ml-1">({formatISK(totals.buyValue)})</span>
        </div>
        <div>
          <span className="text-slate-400">Sell Orders: </span>
          <span className="font-medium text-red-400">{totals.sellCount}</span>
          <span className="text-slate-500 ml-1">({formatISK(totals.sellValue)})</span>
        </div>
        <div>
          <span className="text-slate-400">Total Value: </span>
          <span className="font-medium text-amber-400">
            {formatISK(totals.buyValue + totals.sellValue)}
          </span>
        </div>
      </div>

      <div
        className="rounded-lg border border-slate-700 overflow-auto"
        style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}
      >
        {locationGroups.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400">No active market orders.</p>
          </div>
        ) : (
          locationGroups.map((group) => (
            <LocationGroupRow
              key={group.locationId}
              group={group}
              isExpanded={expandedLocations.has(group.locationId)}
              onToggle={() => toggleLocation(group.locationId)}
            />
          ))
        )}
      </div>

      {ordersLastUpdated && (
        <p className="text-xs text-slate-500 text-right">
          Last updated: {new Date(ordersLastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  )
}
