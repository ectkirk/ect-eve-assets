import { useEffect, useMemo, useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls, type ComparisonLevel } from '@/context'
import { useColumnSettings, useCacheVersion, useExpandCollapse, type ColumnConfig } from '@/hooks'
import { type MarketOrder } from '@/store/market-orders-store'
import { hasType, getType, hasLocation, hasStructure } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import { type MarketComparisonPrices } from '@/api/ref-client'
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
import { formatNumber } from '@/lib/utils'
import { getLocationInfo } from '@/lib/location-utils'

interface OrderRow {
  order: MarketOrder
  ownerName: string
  typeId: number
  typeName: string
  categoryId?: number
  locationName: string
  regionName: string
  systemName: string
  comparison?: MarketComparisonPrices
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

function getComparisonValue(
  comparison: MarketComparisonPrices | undefined,
  level: ComparisonLevel,
  isBuyOrder: boolean
): number | null {
  if (!comparison) return null
  let levelData: { highestBuy: number | null; lowestSell: number | null } | null = null
  if (level === 'station') levelData = comparison.station
  else if (level === 'system') levelData = comparison.system
  else if (level === 'region') levelData = comparison.region
  if (!levelData) return null
  return isBuyOrder ? levelData.highestBuy : levelData.lowestSell
}

function DifferenceCell({ orderPrice, comparisonValue, isBuyOrder }: { orderPrice: number; comparisonValue: number | null; isBuyOrder: boolean }) {
  if (comparisonValue === null) return <span className="text-content-muted">-</span>
  const diff = orderPrice - comparisonValue
  const isGood = isBuyOrder ? diff >= 0 : diff <= 0
  const prefix = diff > 0 ? '+' : ''
  return (
    <span className={isGood ? 'text-status-positive' : 'text-status-negative'}>
      {prefix}{diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  )
}

type SortColumn = 'item' | 'price' | 'comparison' | 'difference' | 'qty' | 'total' | 'expires' | 'owner'
type SortDirection = 'asc' | 'desc'

function SortableHeader({
  column,
  label,
  currentSort,
  currentDirection,
  onSort,
  className = ''
}: {
  column: SortColumn
  label: string
  currentSort: SortColumn
  currentDirection: SortDirection
  onSort: (column: SortColumn) => void
  className?: string
}) {
  const isActive = currentSort === column
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-surface-tertiary/50 ${className}`}
      onClick={() => onSort(column)}
    >
      <div className={`flex items-center gap-1 ${className.includes('text-right') ? 'justify-end' : ''}`}>
        {label}
        {isActive && (
          currentDirection === 'asc'
            ? <ArrowUp className="h-3 w-3" />
            : <ArrowDown className="h-3 w-3" />
        )}
      </div>
    </TableHead>
  )
}

function getExpiryTime(issued: string, duration: number): number {
  return new Date(issued).getTime() + duration * 24 * 60 * 60 * 1000
}

function sortOrders(
  orders: OrderRow[],
  sortColumn: SortColumn,
  sortDirection: SortDirection,
  comparisonLevel: ComparisonLevel,
  isBuyOrder: boolean
): OrderRow[] {
  return [...orders].sort((a, b) => {
    let aVal: number | string = 0
    let bVal: number | string = 0

    switch (sortColumn) {
      case 'item':
        aVal = a.typeName.toLowerCase()
        bVal = b.typeName.toLowerCase()
        break
      case 'price':
        aVal = a.order.price
        bVal = b.order.price
        break
      case 'comparison': {
        const aComp = getComparisonValue(a.comparison, comparisonLevel, isBuyOrder)
        const bComp = getComparisonValue(b.comparison, comparisonLevel, isBuyOrder)
        aVal = aComp ?? (sortDirection === 'asc' ? Infinity : -Infinity)
        bVal = bComp ?? (sortDirection === 'asc' ? Infinity : -Infinity)
        break
      }
      case 'difference': {
        const aComp = getComparisonValue(a.comparison, comparisonLevel, isBuyOrder)
        const bComp = getComparisonValue(b.comparison, comparisonLevel, isBuyOrder)
        aVal = aComp !== null ? a.order.price - aComp : (sortDirection === 'asc' ? Infinity : -Infinity)
        bVal = bComp !== null ? b.order.price - bComp : (sortDirection === 'asc' ? Infinity : -Infinity)
        break
      }
      case 'qty':
        aVal = a.order.volume_remain
        bVal = b.order.volume_remain
        break
      case 'total':
        aVal = a.order.price * a.order.volume_remain
        bVal = b.order.price * b.order.volume_remain
        break
      case 'expires':
        aVal = getExpiryTime(a.order.issued, a.order.duration)
        bVal = getExpiryTime(b.order.issued, b.order.duration)
        break
      case 'owner':
        aVal = a.ownerName.toLowerCase()
        bVal = b.ownerName.toLowerCase()
        break
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
}

function OrdersTable({ orders, comparisonLevel }: { orders: OrderRow[]; comparisonLevel: ComparisonLevel }) {
  const [sellSort, setSellSort] = useState<SortColumn>('total')
  const [sellDirection, setSellDirection] = useState<SortDirection>('desc')
  const [buySort, setBuySort] = useState<SortColumn>('total')
  const [buyDirection, setBuyDirection] = useState<SortDirection>('desc')

  const handleSellSort = (column: SortColumn) => {
    if (sellSort === column) {
      setSellDirection(sellDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSellSort(column)
      setSellDirection('desc')
    }
  }

  const handleBuySort = (column: SortColumn) => {
    if (buySort === column) {
      setBuyDirection(buyDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setBuySort(column)
      setBuyDirection('desc')
    }
  }

  const buyOrders = orders.filter((o) => o.order.is_buy_order)
  const sellOrders = orders.filter((o) => !o.order.is_buy_order)

  const sortedSellOrders = useMemo(() =>
    sortOrders(sellOrders, sellSort, sellDirection, comparisonLevel, false),
    [sellOrders, sellSort, sellDirection, comparisonLevel]
  )

  const sortedBuyOrders = useMemo(() =>
    sortOrders(buyOrders, buySort, buyDirection, comparisonLevel, true),
    [buyOrders, buySort, buyDirection, comparisonLevel]
  )

  return (
    <div className="space-y-4">
      {sellOrders.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-content-muted mb-1 px-1">Sell Orders</h4>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHeader column="item" label="Item" currentSort={sellSort} currentDirection={sellDirection} onSort={handleSellSort} />
                <SortableHeader column="price" label="Price" currentSort={sellSort} currentDirection={sellDirection} onSort={handleSellSort} className="text-right" />
                <SortableHeader column="comparison" label="Lowest Sell" currentSort={sellSort} currentDirection={sellDirection} onSort={handleSellSort} className="text-right" />
                <SortableHeader column="difference" label="Difference" currentSort={sellSort} currentDirection={sellDirection} onSort={handleSellSort} className="text-right" />
                <SortableHeader column="qty" label="Qty" currentSort={sellSort} currentDirection={sellDirection} onSort={handleSellSort} className="text-right" />
                <SortableHeader column="total" label="Total" currentSort={sellSort} currentDirection={sellDirection} onSort={handleSellSort} className="text-right" />
                <SortableHeader column="expires" label="Expires" currentSort={sellSort} currentDirection={sellDirection} onSort={handleSellSort} className="text-right" />
                <SortableHeader column="owner" label="Owner" currentSort={sellSort} currentDirection={sellDirection} onSort={handleSellSort} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedSellOrders.map((row) => {
                const total = row.order.price * row.order.volume_remain
                const comparisonValue = getComparisonValue(row.comparison, comparisonLevel, false)
                return (
                  <TableRow key={row.order.order_id}>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <TypeIcon typeId={row.typeId} categoryId={row.categoryId} />
                        <span className="truncate" title={row.typeName}>{row.typeName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{row.order.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
                      {comparisonValue !== null ? comparisonValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-content-muted">-</span>}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      <DifferenceCell orderPrice={row.order.price} comparisonValue={comparisonValue} isBuyOrder={false} />
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {row.order.volume_remain.toLocaleString()}
                      {row.order.volume_remain !== row.order.volume_total && (
                        <span className="text-content-muted">/{row.order.volume_total.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">{formatNumber(total)}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">{formatExpiry(row.order.issued, row.order.duration)}</TableCell>
                    <TableCell className="py-1.5 text-right text-content-secondary">{row.ownerName}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {buyOrders.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-content-muted mb-1 px-1">Buy Orders</h4>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHeader column="item" label="Item" currentSort={buySort} currentDirection={buyDirection} onSort={handleBuySort} />
                <SortableHeader column="price" label="Price" currentSort={buySort} currentDirection={buyDirection} onSort={handleBuySort} className="text-right" />
                <SortableHeader column="comparison" label="Highest Buy" currentSort={buySort} currentDirection={buyDirection} onSort={handleBuySort} className="text-right" />
                <SortableHeader column="difference" label="Difference" currentSort={buySort} currentDirection={buyDirection} onSort={handleBuySort} className="text-right" />
                <SortableHeader column="qty" label="Qty" currentSort={buySort} currentDirection={buyDirection} onSort={handleBuySort} className="text-right" />
                <SortableHeader column="total" label="Total" currentSort={buySort} currentDirection={buyDirection} onSort={handleBuySort} className="text-right" />
                <SortableHeader column="expires" label="Expires" currentSort={buySort} currentDirection={buyDirection} onSort={handleBuySort} className="text-right" />
                <SortableHeader column="owner" label="Owner" currentSort={buySort} currentDirection={buyDirection} onSort={handleBuySort} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedBuyOrders.map((row) => {
                const total = row.order.price * row.order.volume_remain
                const comparisonValue = getComparisonValue(row.comparison, comparisonLevel, true)
                return (
                  <TableRow key={row.order.order_id}>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <TypeIcon typeId={row.typeId} categoryId={row.categoryId} />
                        <span className="truncate" title={row.typeName}>{row.typeName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{row.order.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
                      {comparisonValue !== null ? comparisonValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-content-muted">-</span>}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      <DifferenceCell orderPrice={row.order.price} comparisonValue={comparisonValue} isBuyOrder={true} />
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {row.order.volume_remain.toLocaleString()}
                      {row.order.volume_remain !== row.order.volume_total && (
                        <span className="text-content-muted">/{row.order.volume_total.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">{formatNumber(total)}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">{formatExpiry(row.order.issued, row.order.duration)}</TableCell>
                    <TableCell className="py-1.5 text-right text-content-secondary">{row.ownerName}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function LocationGroupRow({
  group,
  isExpanded,
  onToggle,
  comparisonLevel,
}: {
  group: LocationGroup
  isExpanded: boolean
  onToggle: () => void
  comparisonLevel: ComparisonLevel
}) {
  const buyOrders = group.orders.filter((o) => o.order.is_buy_order)
  const sellOrders = group.orders.filter((o) => !o.order.is_buy_order)

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary/50 text-left text-sm"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-content-secondary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-content-secondary" />
        )}
        <span className="text-status-info flex-1">{group.locationName}</span>
        <span className="text-xs text-content-muted">
          {group.systemName} / {group.regionName}
        </span>
        <span className="text-xs text-status-positive">
          {buyOrders.length > 0 && `${buyOrders.length} buy`}
        </span>
        <span className="text-xs text-status-negative">
          {sellOrders.length > 0 && `${sellOrders.length} sell`}
        </span>
        <span className="text-sm text-status-highlight tabular-nums">
          {formatNumber(group.totalBuyValue + group.totalSellValue)}
        </span>
      </button>
      {isExpanded && (
        <div className="border-t border-border/50 bg-surface/30 px-4 pb-2">
          <OrdersTable orders={group.orders} comparisonLevel={comparisonLevel} />
        </div>
      )}
    </div>
  )
}

export function MarketOrdersTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const ordersByOwner = useMarketOrdersStore((s) => s.dataByOwner)
  const ordersUpdating = useMarketOrdersStore((s) => s.isUpdating)
  const updateError = useMarketOrdersStore((s) => s.updateError)
  const init = useMarketOrdersStore((s) => s.init)
  const initialized = useMarketOrdersStore((s) => s.initialized)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || ordersUpdating

  useEffect(() => {
    init()
  }, [init])

  const cacheVersion = useCacheVersion()

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

  const comparisonData = useMarketOrdersStore((s) => s.comparisonData)

  const { setExpandCollapse, search, setResultCount, setTotalValue, setColumns, setComparisonLevel } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const [comparisonLevelValue, setComparisonLevelValue] = useState<ComparisonLevel>('station')

  const handleComparisonLevelChange = useCallback((value: ComparisonLevel) => {
    setComparisonLevelValue(value)
  }, [])

  useEffect(() => {
    setComparisonLevel({ value: comparisonLevelValue, onChange: handleComparisonLevelChange })
    return () => setComparisonLevel(null)
  }, [comparisonLevelValue, handleComparisonLevelChange, setComparisonLevel])

  const ORDER_COLUMNS: ColumnConfig[] = useMemo(() => [
    { id: 'item', label: 'Item' },
    { id: 'price', label: 'Price' },
    { id: 'quantity', label: 'Quantity' },
    { id: 'total', label: 'Total' },
    { id: 'comparison', label: 'Comparison' },
    { id: 'expires', label: 'Expires' },
    { id: 'owner', label: 'Owner' },
  ], [])

  const { getColumnsForDropdown } = useColumnSettings('market-orders', ORDER_COLUMNS)

  const locationGroups = useMemo(() => {
    void cacheVersion

    const filteredOrdersByOwner = ordersByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    const groups = new Map<number, LocationGroup>()

    for (const { owner, orders } of filteredOrdersByOwner) {
      for (const order of orders) {
        const type = hasType(order.type_id) ? getType(order.type_id) : undefined
        const locationInfo = getLocationInfo(order.location_id)
        const comparison = comparisonData.get(`${order.location_id}-${order.type_id}`)

        const row: OrderRow = {
          order,
          ownerName: owner.name,
          typeId: order.type_id,
          typeName: type?.name ?? `Unknown Type ${order.type_id}`,
          categoryId: type?.categoryId,
          locationName: locationInfo.name,
          regionName: locationInfo.regionName,
          systemName: locationInfo.systemName,
          comparison,
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

    let sorted = Array.from(groups.values()).sort((a, b) => {
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

    if (search) {
      const searchLower = search.toLowerCase()
      sorted = sorted.map((group) => {
        const filteredOrders = group.orders.filter((o) =>
          o.typeName.toLowerCase().includes(searchLower) ||
          o.ownerName.toLowerCase().includes(searchLower) ||
          o.locationName.toLowerCase().includes(searchLower) ||
          o.regionName.toLowerCase().includes(searchLower) ||
          o.systemName.toLowerCase().includes(searchLower)
        )
        return {
          ...group,
          orders: filteredOrders,
          totalBuyValue: filteredOrders.filter((o) => o.order.is_buy_order).reduce((acc, o) => acc + o.order.price * o.order.volume_remain, 0),
          totalSellValue: filteredOrders.filter((o) => !o.order.is_buy_order).reduce((acc, o) => acc + o.order.price * o.order.volume_remain, 0),
        }
      }).filter((g) => g.orders.length > 0)
    }

    return sorted
  }, [ordersByOwner, cacheVersion, search, selectedSet, comparisonData])

  const expandableIds = useMemo(() => locationGroups.map((g) => g.locationId), [locationGroups])
  const { isExpanded, toggle } = useExpandCollapse(expandableIds, setExpandCollapse)

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

  const totalOrderCount = useMemo(() => {
    let count = 0
    for (const { orders } of ordersByOwner) {
      count += orders.length
    }
    return count
  }, [ordersByOwner])

  useEffect(() => {
    setResultCount({ showing: totals.buyCount + totals.sellCount, total: totalOrderCount })
    return () => setResultCount(null)
  }, [totals.buyCount, totals.sellCount, totalOrderCount, setResultCount])

  useEffect(() => {
    setTotalValue({ value: totals.buyValue + totals.sellValue })
    return () => setTotalValue(null)
  }, [totals.buyValue, totals.sellValue, setTotalValue])

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

  return (
    <div className="h-full rounded-lg border border-border bg-surface-secondary/30 overflow-auto">
      {locationGroups.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-content-secondary">No active market orders.</p>
        </div>
      ) : (
        locationGroups.map((group) => (
          <LocationGroupRow
            key={group.locationId}
            group={group}
            isExpanded={isExpanded(group.locationId)}
            onToggle={() => toggle(group.locationId)}
            comparisonLevel={comparisonLevelValue}
          />
        ))
      )}
    </div>
  )
}
