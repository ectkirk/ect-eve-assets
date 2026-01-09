import { useMemo, useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import { useSortable, SortableHeader, sortRows } from '@/hooks'
import {
  Table,
  TableBody,
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
import { formatNumber, formatFullNumber, cn } from '@/lib/utils'
import { useRegionalMarketActionStore } from '@/store/regional-market-action-store'
import { useReferenceActionStore } from '@/store/reference-action-store'
import type { OrderRow, SortColumn, DiffSortMode } from './types'
import {
  formatExpiry,
  formatPrice,
  CopyButton,
  DiffCell,
  EVEEstCell,
  DiffHeader,
} from './components'

const VIRTUALIZATION_THRESHOLD = 100
const ROW_HEIGHT = 36
const ROW_CLASS = 'border-b border-border/50 hover:bg-surface-tertiary/50'

function TranslatedContextMenuText({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation('common')
  return <>{t(labelKey)}</>
}

interface OrderRowCellsProps {
  row: OrderRow
  show: (col: string) => boolean
}

function OrderRowCells({ row, show }: OrderRowCellsProps) {
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
          <EVEEstCell price={row.order.price} eveEstimated={row.eveEstimated} />
        </TableCell>
      )}
      {show('quantity') && (
        <TableCell className="py-1.5 text-right tabular-nums whitespace-nowrap">
          {formatFullNumber(row.order.volume_remain)}
          {row.order.volume_remain !== row.order.volume_total && (
            <span className="text-content-muted">
              /{formatFullNumber(row.order.volume_total)}
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
    </>
  )
}

function OrderRowWithContext({
  row,
  show,
  navigateToType,
  navigateToReference,
  onSetWaypoint,
  style,
}: {
  row: OrderRow
  show: (col: string) => boolean
  navigateToType: (typeId: number) => void
  navigateToReference: (typeId: number) => void
  onSetWaypoint: (locationId: number, locationName: string) => void
  style?: React.CSSProperties
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow className={ROW_CLASS} style={style}>
          <OrderRowCells row={row} show={show} />
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => navigateToType(row.typeId)}>
          <TranslatedContextMenuText labelKey="contextMenu.viewInMarket" />
        </ContextMenuItem>
        <ContextMenuItem onClick={() => navigateToReference(row.typeId)}>
          <TranslatedContextMenuText labelKey="contextMenu.viewDetails" />
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onSetWaypoint(row.locationId, row.locationName)}
        >
          <TranslatedContextMenuText labelKey="contextMenu.setWaypoint" />
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function VirtualizedTableBody({
  sortedOrders,
  show,
  navigateToType,
  navigateToReference,
  onSetWaypoint,
}: {
  sortedOrders: OrderRow[]
  show: (col: string) => boolean
  navigateToType: (typeId: number) => void
  navigateToReference: (typeId: number) => void
  onSetWaypoint: (locationId: number, locationName: string) => void
}) {
  const containerRef = useRef<HTMLTableSectionElement>(null)

  const virtualizer = useVirtualizer({
    count: sortedOrders.length,
    getScrollElement: () => containerRef.current?.parentElement ?? null,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <TableBody
      ref={containerRef}
      style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
    >
      {virtualRows.map((virtualRow) => {
        const row = sortedOrders[virtualRow.index]!
        return (
          <OrderRowWithContext
            key={row.order.order_id}
            row={row}
            show={show}
            navigateToType={navigateToType}
            navigateToReference={navigateToReference}
            onSetWaypoint={onSetWaypoint}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: ROW_HEIGHT,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          />
        )
      })}
    </TableBody>
  )
}

function StandardTableBody({
  sortedOrders,
  show,
  navigateToType,
  navigateToReference,
  onSetWaypoint,
}: {
  sortedOrders: OrderRow[]
  show: (col: string) => boolean
  navigateToType: (typeId: number) => void
  navigateToReference: (typeId: number) => void
  onSetWaypoint: (locationId: number, locationName: string) => void
}) {
  return (
    <TableBody>
      {sortedOrders.map((row) => (
        <OrderRowWithContext
          key={row.order.order_id}
          row={row}
          show={show}
          navigateToType={navigateToType}
          navigateToReference={navigateToReference}
          onSetWaypoint={onSetWaypoint}
        />
      ))}
    </TableBody>
  )
}

export function OrdersTable({
  orders,
  visibleColumns,
  onSetWaypoint,
}: {
  orders: OrderRow[]
  visibleColumns: Set<string>
  onSetWaypoint: (locationId: number, locationName: string) => void
}) {
  const { sortColumn, sortDirection, handleSort } = useSortable<SortColumn>(
    'total',
    'desc'
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

  const useVirtualization = sortedOrders.length > VIRTUALIZATION_THRESHOLD

  return (
    <Table className={cn(useVirtualization && 'block')}>
      <TableHeader
        className={cn(
          'sticky top-0 z-10 bg-surface-secondary',
          useVirtualization && 'table w-full'
        )}
      >
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
      {useVirtualization ? (
        <VirtualizedTableBody
          sortedOrders={sortedOrders}
          show={show}
          navigateToType={navigateToType}
          navigateToReference={navigateToReference}
          onSetWaypoint={onSetWaypoint}
        />
      ) : (
        <StandardTableBody
          sortedOrders={sortedOrders}
          show={show}
          navigateToType={navigateToType}
          navigateToReference={navigateToReference}
          onSetWaypoint={onSetWaypoint}
        />
      )}
    </Table>
  )
}
