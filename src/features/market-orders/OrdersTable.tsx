import { useCallback, useMemo, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useFixedVirtualRows } from '@/hooks/use-fixed-virtual-rows'
import { useSortable, sortRows } from '@/hooks'
import { SortableHeader } from '@/components/ui/sortable-header'
import {
  Table,
  TableBody,
  TableSpacerRow,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { formatNumber, formatFullNumber } from '@/lib/utils'
import { useRegionalMarketActionStore } from '@/store/regional-market-action-store'
import { useReferenceActionStore } from '@/store/reference-action-store'
import type { OrderRow, SortColumn, DiffSortMode } from './types'
import {
  formatExpiry,
  formatPrice,
  DiffCell,
  EVEEstCell,
  DiffHeader,
} from './components'

const ROW_HEIGHT = 36
const ROW_CLASS = 'h-9 border-b border-border/50 hover:bg-surface-tertiary/50'

function TranslatedContextMenuText({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation('common')
  return <>{t(labelKey)}</>
}

interface OrderRowCellsProps {
  row: OrderRow
  show: (col: string) => boolean
  onItemDoubleClick?: () => void
}

function OrderRowCells({ row, show, onItemDoubleClick }: OrderRowCellsProps) {
  const { t } = useTranslation('common')
  const isBuy = row.order.is_buy_order
  const total = row.order.price * row.order.volume_remain
  const compPrice = isBuy ? row.highestBuy : row.lowestSell

  return (
    <>
      {show('item') && (
        <TableCell className="py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <OwnerIcon
              ownerId={row.ownerId}
              ownerType={row.ownerType}
              ownerName={row.ownerName}
              size="sm"
            />
            <TypeIcon typeId={row.typeId} categoryId={row.categoryId} />
            <span
              className="truncate"
              title={row.typeName}
              onDoubleClick={onItemDoubleClick}
            >
              {row.typeName}
            </span>
          </div>
        </TableCell>
      )}
      {show('type') && (
        <TableCell className="py-1.5 whitespace-nowrap">
          {isBuy
            ? t('searchBar.orderTypes.buy')
            : t('searchBar.orderTypes.sell')}
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
        <TableCell className="py-1.5 text-right tabular-nums">
          {formatPrice(row.order.price)}
        </TableCell>
      )}
      {show('lowest') && (
        <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
          {compPrice !== null ? (
            formatPrice(compPrice)
          ) : (
            <span className="text-content-muted">-</span>
          )}
        </TableCell>
      )}
      {show('diff') && (
        <TableCell className="py-1.5 text-right tabular-nums">
          <DiffCell
            price={row.order.price}
            comparisonPrice={compPrice}
            isBuyOrder={isBuy}
          />
        </TableCell>
      )}
      {show('eveEstimated') && (
        <TableCell className="py-1.5 text-right tabular-nums">
          <EVEEstCell price={row.order.price} eveEstimated={row.eveEstimated} />
        </TableCell>
      )}
      {show('quantity') && (
        <TableCell className="py-1.5 text-right tabular-nums">
          {formatFullNumber(row.order.volume_remain)}
          {row.order.volume_remain !== row.order.volume_total && (
            <span className="text-content-muted">
              /{formatFullNumber(row.order.volume_total)}
            </span>
          )}
        </TableCell>
      )}
      {show('total') && (
        <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
          {formatNumber(total)}
        </TableCell>
      )}
      {show('expires') && (
        <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
          {formatExpiry(row.order.issued, row.order.duration)}
        </TableCell>
      )}
    </>
  )
}

function OrderRowWithContext({
  row,
  show,
  navigateToType,
  navigateToReference,
  onSetWaypoint,
  onOpenMarket,
  onItemDoubleClick,
}: {
  row: OrderRow
  show: (col: string) => boolean
  navigateToType: (typeId: number) => void
  navigateToReference: (typeId: number) => void
  onSetWaypoint: (locationId: number, locationName: string) => void
  onOpenMarket: (typeId: number, typeName: string) => void
  onItemDoubleClick: (typeId: number, typeName: string) => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow className={ROW_CLASS}>
          <OrderRowCells
            row={row}
            show={show}
            onItemDoubleClick={() => {
              onItemDoubleClick(row.typeId, row.typeName)
            }}
          />
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() => {
            navigateToType(row.typeId)
          }}
        >
          <TranslatedContextMenuText labelKey="contextMenu.viewInMarket" />
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            onOpenMarket(row.typeId, row.typeName)
          }}
        >
          <TranslatedContextMenuText labelKey="contextMenu.openMarketIngame" />
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            navigateToReference(row.typeId)
          }}
        >
          <TranslatedContextMenuText labelKey="contextMenu.viewDetails" />
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            onSetWaypoint(row.locationId, row.locationName)
          }}
        >
          <TranslatedContextMenuText labelKey="contextMenu.setWaypoint" />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function OrdersTableBody({
  sortedOrders,
  columnCount,
  getScrollElement,
  show,
  navigateToType,
  navigateToReference,
  onSetWaypoint,
  onOpenMarket,
  onItemDoubleClick,
}: {
  sortedOrders: OrderRow[]
  columnCount: number
  getScrollElement: () => HTMLElement | null
  show: (col: string) => boolean
  navigateToType: (typeId: number) => void
  navigateToReference: (typeId: number) => void
  onSetWaypoint: (locationId: number, locationName: string) => void
  onOpenMarket: (typeId: number, typeName: string) => void
  onItemDoubleClick: (typeId: number, typeName: string) => void
}) {
  const { virtualRows, paddingStart, paddingEnd } = useFixedVirtualRows({
    count: sortedOrders.length,
    getScrollElement,
    rowHeight: ROW_HEIGHT,
    overscan: 10,
  })

  return (
    <TableBody>
      <TableSpacerRow height={paddingStart} colSpan={columnCount} />
      {virtualRows.map((virtualRow) => {
        const row = sortedOrders[virtualRow.index]
        if (!row) return null
        return (
          <OrderRowWithContext
            key={row.order.order_id}
            row={row}
            show={show}
            navigateToType={navigateToType}
            navigateToReference={navigateToReference}
            onSetWaypoint={onSetWaypoint}
            onOpenMarket={onOpenMarket}
            onItemDoubleClick={onItemDoubleClick}
          />
        )
      })}
      <TableSpacerRow height={paddingEnd} colSpan={columnCount} />
    </TableBody>
  )
}

export function OrdersTable({
  orders,
  visibleColumns,
  onSetWaypoint,
  onOpenMarket,
  onItemDoubleClick,
}: {
  orders: OrderRow[]
  visibleColumns: Set<string>
  onSetWaypoint: (locationId: number, locationName: string) => void
  onOpenMarket: (typeId: number, typeName: string) => void
  onItemDoubleClick: (typeId: number, typeName: string) => void
}) {
  const { sortColumn, sortDirection, handleSort } = useSortable<SortColumn>(
    'total',
    'desc',
  )
  const [diffSortMode, setDiffSortMode] = useState<DiffSortMode>('number')
  const show = (col: string) => visibleColumns.has(col)
  const navigateToType = useRegionalMarketActionStore((s) => s.navigateToType)
  const navigateToReference = useReferenceActionStore((s) => s.navigateToType)

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

  const scrollRef = useRef<HTMLDivElement>(null)
  const getScrollElement = useCallback(() => scrollRef.current, [])

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <Table resizeKey="market-orders">
        <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
          <TableRow className="hover:bg-transparent border-b border-border">
            {show('item') && (
              <SortableHeader
                column="item"
                label="columns.item"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('type') && (
              <SortableHeader
                column="type"
                label="columns.type"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('location') && (
              <SortableHeader
                column="location"
                label="columns.location"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('price') && (
              <SortableHeader
                column="price"
                label="columns.price"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('lowest') && (
              <SortableHeader
                column="comparison"
                label="columns.best"
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
                label="columns.eveEst"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('quantity') && (
              <SortableHeader
                column="qty"
                label="columns.quantity"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('total') && (
              <SortableHeader
                column="total"
                label="columns.total"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('expires') && (
              <SortableHeader
                column="expires"
                label="columns.exp"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
          </TableRow>
        </TableHeader>
        <OrdersTableBody
          sortedOrders={sortedOrders}
          columnCount={visibleColumns.size}
          getScrollElement={getScrollElement}
          show={show}
          navigateToType={navigateToType}
          navigateToReference={navigateToReference}
          onSetWaypoint={onSetWaypoint}
          onOpenMarket={onOpenMarket}
          onItemDoubleClick={onItemDoubleClick}
        />
      </Table>
    </div>
  )
}
