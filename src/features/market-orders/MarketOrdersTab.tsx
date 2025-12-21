import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check, ArrowUp, ArrowDown } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import {
  useColumnSettings,
  useCacheVersion,
  useSortable,
  SortableHeader,
  sortRows,
  type ColumnConfig,
} from '@/hooks'
import { type MarketOrder } from '@/store/market-orders-store'
import { hasType, getType } from '@/store/reference-cache'
import { useRegionalMarketStore } from '@/store/regional-market-store'
import { useESIPricesStore } from '@/store/esi-prices-store'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import { formatNumber } from '@/lib/utils'
import { getLocationInfo } from '@/lib/location-utils'

const ORDER_TYPE_OPTIONS = [
  { value: 'all', label: 'All Orders' },
  { value: 'sell', label: 'Sell Orders' },
  { value: 'buy', label: 'Buy Orders' },
] as const

const ORDER_COLUMNS: ColumnConfig[] = [
  { id: 'item', label: 'Item' },
  { id: 'type', label: 'Type' },
  { id: 'location', label: 'Location' },
  { id: 'price', label: 'Price' },
  { id: 'lowest', label: 'Best Order' },
  { id: 'diff', label: 'Difference' },
  { id: 'eveEstimated', label: 'EVE Estimated' },
  { id: 'quantity', label: 'Quantity' },
  { id: 'total', label: 'Total' },
  { id: 'expires', label: 'Expires' },
]

interface OrderRow {
  order: MarketOrder
  ownerId: number
  ownerType: 'character' | 'corporation'
  ownerName: string
  typeId: number
  typeName: string
  categoryId?: number
  locationId: number
  locationName: string
  regionName: string
  systemName: string
  lowestSell: number | null
  highestBuy: number | null
  eveEstimated: number | null
  expiryTime: number
}

function formatExpiry(issued: string, duration: number): string {
  const issuedDate = new Date(issued)
  const expiryDate = new Date(
    issuedDate.getTime() + duration * 24 * 60 * 60 * 1000
  )
  const now = Date.now()
  const remaining = expiryDate.getTime() - now

  if (remaining <= 0) return 'Expired'

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  if (days > 0) return `${days}d`

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  return `${hours}h`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-0.5 rounded hover:bg-surface-secondary/50 text-content-muted hover:text-content-secondary transition-colors"
      title="Copy name"
    >
      {copied ? (
        <Check className="h-3 w-3 text-status-positive" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  )
}

function formatPrice(value: number): string {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted
}

function DiffCell({
  price,
  comparisonPrice,
  isBuyOrder,
}: {
  price: number
  comparisonPrice: number | null
  isBuyOrder: boolean
}) {
  if (comparisonPrice === null)
    return <span className="text-content-muted">-</span>
  const diff = price - comparisonPrice
  if (diff === 0) {
    return <span>0</span>
  }
  const isGood = isBuyOrder ? diff > 0 : diff < 0
  const formattedDiff = formatPrice(Math.abs(diff))
  const pct = comparisonPrice > 0 ? Math.abs((diff / comparisonPrice) * 100) : 0
  const pctStr = pct.toFixed(1).replace(/\.0$/, '')
  return (
    <span>
      {diff < 0 ? '-' : '+'}
      {formattedDiff}{' '}
      <span
        className={`text-xs ${isGood ? 'text-status-positive' : 'text-status-negative'}`}
      >
        ({pctStr}%)
      </span>
    </span>
  )
}

function EVEEstCell({
  price,
  eveEstimated,
}: {
  price: number
  eveEstimated: number | null
}) {
  if (eveEstimated === null)
    return <span className="text-content-muted">-</span>
  const isAbove = price > eveEstimated
  return (
    <span className={isAbove ? 'text-status-positive' : 'text-status-negative'}>
      {formatPrice(eveEstimated)}
    </span>
  )
}

type SortColumn =
  | 'item'
  | 'type'
  | 'price'
  | 'comparison'
  | 'diff'
  | 'eveEstimated'
  | 'qty'
  | 'total'
  | 'expires'
  | 'location'
type DiffSortMode = 'number' | 'percent'

function DiffHeader({
  sortColumn,
  sortDirection,
  onSort,
  diffSortMode,
  onDiffSortModeChange,
}: {
  sortColumn: SortColumn
  sortDirection: 'asc' | 'desc'
  onSort: (column: SortColumn) => void
  diffSortMode: DiffSortMode
  onDiffSortModeChange: (mode: DiffSortMode) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const isActive = sortColumn === 'diff'

  const handleClick = () => onSort('diff')

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }

  useEffect(() => {
    if (menuOpen) {
      const close = () => setMenuOpen(false)
      window.addEventListener('click', close)
      return () => window.removeEventListener('click', close)
    }
  }, [menuOpen])

  return (
    <TableHead
      className="text-right cursor-pointer select-none hover:bg-surface-tertiary/50"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="flex items-center gap-1 justify-end">
        Diff {diffSortMode === 'percent' ? '(%)' : ''}
        {isActive &&
          (sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </div>
      {menuOpen &&
        createPortal(
          <div
            className="fixed z-50 bg-surface border border-border rounded shadow-lg py-1 text-sm"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              className={`w-full px-3 py-1 text-left hover:bg-surface-secondary ${diffSortMode === 'number' ? 'text-accent' : ''}`}
              onClick={() => {
                onDiffSortModeChange('number')
                setMenuOpen(false)
              }}
            >
              Sort by ISK
            </button>
            <button
              className={`w-full px-3 py-1 text-left hover:bg-surface-secondary ${diffSortMode === 'percent' ? 'text-accent' : ''}`}
              onClick={() => {
                onDiffSortModeChange('percent')
                setMenuOpen(false)
              }}
            >
              Sort by %
            </button>
          </div>,
          document.body
        )}
    </TableHead>
  )
}

function OrdersTable({
  orders,
  visibleColumns,
}: {
  orders: OrderRow[]
  visibleColumns: Set<string>
}) {
  const { sortColumn, sortDirection, handleSort } = useSortable<SortColumn>(
    'total',
    'desc'
  )
  const [diffSortMode, setDiffSortMode] = useState<DiffSortMode>('number')
  const show = (col: string) => visibleColumns.has(col)

  const sortedOrders = useMemo(() => {
    return sortRows(orders, sortColumn, sortDirection, (row, column) => {
      const isBuy = row.order.is_buy_order
      switch (column) {
        case 'item':
          return row.typeName.toLowerCase()
        case 'type':
          return isBuy ? 1 : 0
        case 'price':
          return row.order.price
        case 'comparison': {
          const compPrice = isBuy ? row.highestBuy : row.lowestSell
          return compPrice ?? (sortDirection === 'asc' ? Infinity : -Infinity)
        }
        case 'diff': {
          const compPrice = isBuy ? row.highestBuy : row.lowestSell
          if (compPrice === null)
            return sortDirection === 'asc' ? Infinity : -Infinity
          const diff = row.order.price - compPrice
          if (diffSortMode === 'percent') {
            return compPrice > 0
              ? (diff / compPrice) * 100
              : sortDirection === 'asc'
                ? Infinity
                : -Infinity
          }
          return diff
        }
        case 'eveEstimated':
          return (
            row.eveEstimated ?? (sortDirection === 'asc' ? Infinity : -Infinity)
          )
        case 'qty':
          return row.order.volume_remain
        case 'total':
          return row.order.price * row.order.volume_remain
        case 'expires':
          return row.expiryTime
        case 'location':
          return row.locationName.toLowerCase()
        default:
          return 0
      }
    })
  }, [orders, sortColumn, sortDirection, diffSortMode])

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {show('item') && (
            <SortableHeader
              column="item"
              label="Item"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          )}
          {show('type') && (
            <SortableHeader
              column="type"
              label="Type"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          )}
          {show('location') && (
            <SortableHeader
              column="location"
              label="Location"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          )}
          {show('price') && (
            <SortableHeader
              column="price"
              label="Price"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right"
            />
          )}
          {show('lowest') && (
            <SortableHeader
              column="comparison"
              label="Best"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right"
            />
          )}
          {show('diff') && (
            <DiffHeader
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              diffSortMode={diffSortMode}
              onDiffSortModeChange={setDiffSortMode}
            />
          )}
          {show('eveEstimated') && (
            <SortableHeader
              column="eveEstimated"
              label="EVE Est"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right"
            />
          )}
          {show('quantity') && (
            <SortableHeader
              column="qty"
              label="Qty"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right"
            />
          )}
          {show('total') && (
            <SortableHeader
              column="total"
              label="Total"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right"
            />
          )}
          {show('expires') && (
            <SortableHeader
              column="expires"
              label="Exp"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right"
            />
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedOrders.map((row) => {
          const isBuy = row.order.is_buy_order
          const total = row.order.price * row.order.volume_remain
          const compPrice = isBuy ? row.highestBuy : row.lowestSell
          return (
            <TableRow key={row.order.order_id}>
              {show('item') && (
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <OwnerIcon
                      ownerId={row.ownerId}
                      ownerType={row.ownerType}
                      size="sm"
                    />
                    <TypeIcon typeId={row.typeId} categoryId={row.categoryId} />
                    <span className="truncate" title={row.typeName}>
                      {row.typeName}
                    </span>
                    <CopyButton text={row.typeName} />
                  </div>
                </TableCell>
              )}
              {show('type') && (
                <TableCell className="py-1.5">
                  {isBuy ? 'Buy' : 'Sell'}
                </TableCell>
              )}
              {show('location') && (
                <TableCell className="py-1.5 text-content-secondary">
                  <div
                    className="truncate"
                    title={`${row.locationName} • ${row.systemName} • ${row.regionName}`}
                  >
                    {row.locationName}
                  </div>
                </TableCell>
              )}
              {show('price') && (
                <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap">
                  {formatPrice(row.order.price)}
                </TableCell>
              )}
              {show('lowest') && (
                <TableCell className="py-1.5 text-right tabular-nums text-content-secondary whitespace-nowrap">
                  {compPrice !== null ? (
                    formatPrice(compPrice)
                  ) : (
                    <span className="text-content-muted">-</span>
                  )}
                </TableCell>
              )}
              {show('diff') && (
                <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap">
                  <DiffCell
                    price={row.order.price}
                    comparisonPrice={compPrice}
                    isBuyOrder={isBuy}
                  />
                </TableCell>
              )}
              {show('eveEstimated') && (
                <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap">
                  <EVEEstCell
                    price={row.order.price}
                    eveEstimated={row.eveEstimated}
                  />
                </TableCell>
              )}
              {show('quantity') && (
                <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap">
                  {row.order.volume_remain.toLocaleString()}
                  {row.order.volume_remain !== row.order.volume_total && (
                    <span className="text-content-muted">
                      /{row.order.volume_total.toLocaleString()}
                    </span>
                  )}
                </TableCell>
              )}
              {show('total') && (
                <TableCell className="py-1.5 text-right tabular-nums text-status-highlight whitespace-nowrap">
                  {formatNumber(total)}
                </TableCell>
              )}
              {show('expires') && (
                <TableCell className="py-1.5 text-right tabular-nums text-content-secondary whitespace-nowrap">
                  {formatExpiry(row.order.issued, row.order.duration)}
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

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
    () => useMarketOrdersStore.getOrdersByOwner(),
    [itemsById, visibilityByOwner]
  )

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || ordersUpdating

  useEffect(() => {
    init()
  }, [init])

  const cacheVersion = useCacheVersion()

  const regionalMarketStore = useRegionalMarketStore()
  const getAveragePrice = useESIPricesStore((s) => s.getAveragePrice)

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
    void cacheVersion

    const filteredOrdersByOwner = ordersByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    const orders: OrderRow[] = []

    for (const { owner, orders: ownerOrders } of filteredOrdersByOwner) {
      for (const order of ownerOrders) {
        const type = hasType(order.type_id) ? getType(order.type_id) : undefined
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
        const eveEstimated = getAveragePrice(order.type_id) ?? null
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
  }, [
    ordersByOwner,
    cacheVersion,
    selectedSet,
    regionalMarketStore,
    getAveragePrice,
  ])

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

  if (filteredOrders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-content-secondary">No market orders.</p>
      </div>
    )
  }

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
        <OrdersTable orders={filteredOrders} visibleColumns={visibleColumns} />
      </div>
    </div>
  )
}
