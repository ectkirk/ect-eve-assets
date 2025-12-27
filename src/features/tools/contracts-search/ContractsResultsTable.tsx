import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { FileText, ChevronUp, ChevronDown } from 'lucide-react'
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
import { usePriceStore } from '@/store/price-store'
import { getType } from '@/store/cache'
import type {
  SearchContract,
  ContractSearchMode,
  ContractTopItem,
} from './types'

function getContractEstValue(topItems: ContractTopItem[]): number {
  const { getItemPrice } = usePriceStore.getState()
  return topItems.reduce((sum, item) => {
    if (!item.typeId) return sum
    const price = getItemPrice(item.typeId, {
      itemId: item.itemId,
      isBlueprintCopy: item.isBlueprintCopy,
    })
    return sum + price * item.quantity
  }, 0)
}

function canShowEstValue(contract: SearchContract): boolean {
  if (contract.itemCount >= 6) return false
  return !contract.topItems.some(
    (item) =>
      item.isBlueprintCopy === true ||
      (item.materialEfficiency ?? 0) > 0 ||
      (item.timeEfficiency ?? 0) > 0
  )
}

function formatItemName(item: ContractTopItem): string {
  if (item.isBlueprintCopy == null) return item.typeName
  if (!item.isBlueprintCopy && item.materialEfficiency == null) {
    return item.typeName
  }

  const bpType = item.isBlueprintCopy ? 'BPC' : 'BPO'
  const me = item.materialEfficiency ?? 0
  const te = item.timeEfficiency ?? 0
  const runs = item.runs ?? 0

  if (item.isBlueprintCopy) {
    return `${item.typeName} (${bpType}) ME${me} TE${te} ${runs}R`
  }
  return `${item.typeName} (${bpType}) ME${me} TE${te}`
}

const PAGE_SIZE = 100
const MAX_VISIBLE_PAGES = 10

export type SortPreset =
  | 'created-asc'
  | 'created-desc'
  | 'timeLeft-asc'
  | 'timeLeft-desc'
  | 'price-asc'
  | 'price-desc'

export const SORT_PRESETS: { value: SortPreset; label: string }[] = [
  { value: 'created-asc', label: 'Date Created (Oldest First)' },
  { value: 'created-desc', label: 'Date Created (Newest First)' },
  { value: 'timeLeft-asc', label: 'Time Left (Shortest First)' },
  { value: 'timeLeft-desc', label: 'Time Left (Longest First)' },
  { value: 'price-asc', label: 'Price (Lowest First)' },
  { value: 'price-desc', label: 'Price (Highest First)' },
]

type SortColumn =
  | 'contract'
  | 'location'
  | 'price'
  | 'estValue'
  | 'difference'
  | 'timeLeft'
  | 'issuer'
  | 'created'
  | 'description'

type SortDirection = 'asc' | 'desc'

function getTimeLeft(dateExpired: string): string {
  const now = new Date()
  const expiry = new Date(dateExpired)
  const diff = expiry.getTime() - now.getTime()

  if (diff <= 0) return 'Expired'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0) return `${days}d ${hours}h`
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

function getSecurityColor(sec: number): string {
  if (sec >= 0.5) return 'text-status-positive'
  if (sec > 0) return 'text-status-warning'
  return 'text-status-negative'
}

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const halfWindow = Math.floor(MAX_VISIBLE_PAGES / 2)
  let start = currentPage - halfWindow
  let end = currentPage + halfWindow

  if (start < 1) {
    start = 1
    end = MAX_VISIBLE_PAGES
  } else if (end > totalPages) {
    end = totalPages
    start = totalPages - MAX_VISIBLE_PAGES + 1
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  className,
}: {
  column: SortColumn
  label: string
  sortColumn: SortColumn | null
  sortDirection: SortDirection
  onSort: (column: SortColumn) => void
  className?: string
}) {
  const isActive = sortColumn === column
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-surface-tertiary ${className ?? ''}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive &&
          (sortDirection === 'asc' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          ))}
      </div>
    </TableHead>
  )
}

interface ContractsResultsTableProps {
  contracts: SearchContract[]
  mode: ContractSearchMode
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onViewContract: (contract: SearchContract) => void
  isLoading: boolean
}

export function ContractsResultsTable({
  contracts,
  mode,
  page,
  totalPages,
  total,
  onPageChange,
  onViewContract,
  isLoading,
}: ContractsResultsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [hoveredContract, setHoveredContract] = useState<SearchContract | null>(
    null
  )
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null
  )
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    contract: SearchContract
  } | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null
  )

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortColumn(column)
        setSortDirection('asc')
      }
    },
    [sortColumn]
  )

  const handleRowHover = useCallback(
    (contract: SearchContract, e: React.MouseEvent) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
      if (contract.topItems.length > 0) {
        const x = e.clientX
        const y = e.clientY
        hoverTimeoutRef.current = setTimeout(() => {
          setCursorPos({ x, y })
          setHoveredContract(contract)
        }, 300)
      }
    },
    []
  )

  const handleRowLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setCursorPos(null)
    setTooltipPos(null)
    setHoveredContract(null)
  }, [])

  useEffect(() => {
    if (!cursorPos || !hoveredContract || !tooltipRef.current) return

    const rect = tooltipRef.current.getBoundingClientRect()
    const padding = 12
    let x = cursorPos.x + padding
    let y = cursorPos.y + padding

    if (x + rect.width > window.innerWidth - padding) {
      x = cursorPos.x - rect.width - padding
    }
    if (y + rect.height > window.innerHeight - padding) {
      y = cursorPos.y - rect.height - padding
    }

    requestAnimationFrame(() => setTooltipPos({ x, y }))
  }, [cursorPos, hoveredContract])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, contract: SearchContract) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, contract })
    },
    []
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => closeContextMenu()
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu, closeContextMenu])

  const sortedContracts = useMemo(() => {
    if (!sortColumn) return contracts

    return [...contracts].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortColumn) {
        case 'contract':
          aVal = (a.topItems[0]?.typeName ?? '').toLowerCase()
          bVal = (b.topItems[0]?.typeName ?? '').toLowerCase()
          break
        case 'location':
          aVal = a.systemName.toLowerCase()
          bVal = b.systemName.toLowerCase()
          break
        case 'price':
          aVal = mode === 'courier' ? (a.reward ?? 0) : a.price
          bVal = mode === 'courier' ? (b.reward ?? 0) : b.price
          break
        case 'estValue':
          aVal = getContractEstValue(a.topItems)
          bVal = getContractEstValue(b.topItems)
          break
        case 'difference': {
          const aPrice = mode === 'courier' ? (a.reward ?? 0) : a.price
          const bPrice = mode === 'courier' ? (b.reward ?? 0) : b.price
          aVal = aPrice - getContractEstValue(a.topItems)
          bVal = bPrice - getContractEstValue(b.topItems)
          break
        }
        case 'timeLeft':
          aVal = new Date(a.dateExpired).getTime()
          bVal = new Date(b.dateExpired).getTime()
          break
        case 'issuer':
          aVal = a.issuerName.toLowerCase()
          bVal = b.issuerName.toLowerCase()
          break
        case 'created':
          aVal = new Date(a.dateIssued).getTime()
          bVal = new Date(b.dateIssued).getTime()
          break
        case 'description':
          aVal = a.title.toLowerCase()
          bVal = b.title.toLowerCase()
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [contracts, sortColumn, sortDirection, mode])

  const visiblePages = useMemo(
    () => getVisiblePages(page, totalPages),
    [page, totalPages]
  )

  if (contracts.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-content-muted">
        <FileText className="mb-2 h-12 w-12 opacity-50" />
        <p>No contracts found</p>
        <p className="text-sm">Try adjusting your search filters</p>
      </div>
    )
  }

  const startItem = (page - 1) * PAGE_SIZE + 1
  const endItem = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div
        ref={tableRef}
        className={`relative flex-1 overflow-auto ${isLoading ? 'opacity-50' : ''}`}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHeader
                column="contract"
                label="Contract"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="location"
                label="Location"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="price"
                label={mode === 'courier' ? 'Reward' : 'Price'}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="estValue"
                label="Est. Value"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="difference"
                label="Difference"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="timeLeft"
                label="Time Left"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="issuer"
                label="Issuer"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="created"
                label="Created"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="description"
                label="Description"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedContracts.map((contract) => (
              <TableRow
                key={contract.contractId}
                onMouseEnter={(e) => handleRowHover(contract, e)}
                onMouseLeave={handleRowLeave}
                onContextMenu={(e) => handleContextMenu(e, contract)}
                className={
                  hoveredContract?.contractId === contract.contractId
                    ? 'bg-surface-tertiary'
                    : ''
                }
              >
                <TableCell className="font-medium">
                  {contract.topItems.length > 1 ? (
                    '[Multiple Items]'
                  ) : contract.topItems[0] ? (
                    <span className="flex items-center gap-1.5">
                      {contract.topItems[0].typeId && (
                        <TypeIcon
                          typeId={contract.topItems[0].typeId}
                          categoryId={getType(contract.topItems[0].typeId)?.categoryId}
                          isBlueprintCopy={contract.topItems[0].isBlueprintCopy}
                          size="sm"
                        />
                      )}
                      {formatItemName(contract.topItems[0])}
                      {contract.topItems[0].quantity > 1 && (
                        <span className="text-content-secondary">
                          x{contract.topItems[0].quantity.toLocaleString()}
                        </span>
                      )}
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  <div>
                    {contract.securityStatus != null && (
                      <>
                        <span
                          className={getSecurityColor(contract.securityStatus)}
                        >
                          {contract.securityStatus.toFixed(1)}
                        </span>{' '}
                      </>
                    )}
                    <span className="text-content">{contract.systemName}</span>
                  </div>
                  <div className="text-xs text-content-muted">
                    {contract.regionName}
                  </div>
                </TableCell>
                <TableCell className="font-mono">
                  {formatNumber(
                    mode === 'courier' ? (contract.reward ?? 0) : contract.price
                  )}{' '}
                  <span className="text-content-muted">ISK</span>
                  {mode === 'courier' && contract.collateral && (
                    <div className="text-xs text-content-muted">
                      Collateral: {formatNumber(contract.collateral)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono">
                  {(() => {
                    if (!canShowEstValue(contract)) return '-'
                    const estValue = getContractEstValue(contract.topItems)
                    if (estValue === 0) return '-'
                    return (
                      <>
                        {formatNumber(estValue)}{' '}
                        <span className="text-content-muted">ISK</span>
                      </>
                    )
                  })()}
                </TableCell>
                <TableCell className="font-mono">
                  {(() => {
                    if (!canShowEstValue(contract)) return '-'
                    const estValue = getContractEstValue(contract.topItems)
                    if (estValue === 0) return '-'
                    const price =
                      mode === 'courier'
                        ? (contract.reward ?? 0)
                        : contract.price
                    const diff = price - estValue
                    const pct = (diff / estValue) * 100
                    const color =
                      diff > 0
                        ? 'text-status-negative'
                        : diff < 0
                          ? 'text-status-positive'
                          : 'text-content-muted'
                    const isScam = Math.abs(pct) >= 750
                    return (
                      <span className={color}>
                        {diff >= 0 ? '+' : ''}
                        {formatNumber(diff)}{' '}
                        {isScam ? (
                          <span className="text-status-warning">(Scam?)</span>
                        ) : (
                          `(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`
                        )}
                      </span>
                    )
                  })()}
                </TableCell>
                <TableCell>{getTimeLeft(contract.dateExpired)}</TableCell>
                <TableCell>{contract.issuerName}</TableCell>
                <TableCell className="text-content-secondary">
                  {formatDate(contract.dateIssued)}
                </TableCell>
                <TableCell className="max-w-xs truncate text-content-secondary">
                  {contract.title ? decodeHtmlEntities(contract.title) : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {hoveredContract && hoveredContract.topItems.length > 0 && (
          <div
            ref={tooltipRef}
            className="fixed z-50 min-w-56 rounded border border-border bg-surface-secondary p-3 shadow-lg"
            style={{
              left: tooltipPos?.x ?? cursorPos?.x ?? 0,
              top: tooltipPos?.y ?? cursorPos?.y ?? 0,
              visibility: tooltipPos ? 'visible' : 'hidden',
            }}
          >
            <div className="mb-2 font-medium text-amber-400">
              {hoveredContract.topItems.length > 1
                ? '[Multiple Items]'
                : hoveredContract.topItems[0]
                  ? formatItemName(hoveredContract.topItems[0])
                  : '-'}
            </div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-content-muted">Contract Type: </span>
                <span className="text-content">
                  {hoveredContract.type === 'item_exchange'
                    ? 'Item Exchange'
                    : hoveredContract.type === 'auction'
                      ? 'Auction'
                      : 'Courier'}
                </span>
              </div>
              <div>
                <span className="text-content-muted">Location: </span>
                <span className="text-content">
                  {hoveredContract.systemName}
                  {hoveredContract.securityStatus != null && (
                    <span
                      className={`ml-1 ${getSecurityColor(hoveredContract.securityStatus)}`}
                    >
                      ({hoveredContract.securityStatus.toFixed(1)})
                    </span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-content-muted">Issuer: </span>
                <span className="text-content">
                  {hoveredContract.issuerName}
                </span>
              </div>
              {hoveredContract.title && (
                <div>
                  <span className="text-content-muted">
                    Description By Issuer:{' '}
                  </span>
                  <span className="text-content">
                    {decodeHtmlEntities(hoveredContract.title)}
                  </span>
                </div>
              )}
              <div className="mt-2">
                <span className="text-content-muted">Items:</span>
                <ul className="ml-2 mt-1 space-y-0.5">
                  {hoveredContract.topItems.map((item, idx) => (
                    <li key={item.typeId ?? idx} className="text-content">
                      {item.quantity.toLocaleString()} x {formatItemName(item)}
                    </li>
                  ))}
                  {hoveredContract.itemCount >
                    hoveredContract.topItems.length && (
                    <li className="text-content-muted">More...</li>
                  )}
                </ul>
              </div>
              {hoveredContract.topItems.length > 1 && (
                <div className="mt-2 text-content-muted">
                  Contract contains multiple items. Open it to view them.
                </div>
              )}
            </div>
          </div>
        )}

        {contextMenu && (
          <div
            className="fixed z-50 rounded border border-border bg-surface-secondary py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-4 py-1.5 text-left text-sm hover:bg-surface-tertiary"
              onClick={() => {
                onViewContract(contextMenu.contract)
                closeContextMenu()
              }}
            >
              View Contract
            </button>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="text-sm text-content-secondary">
            Showing {startItem.toLocaleString()}-{endItem.toLocaleString()} of{' '}
            {total.toLocaleString()}
          </span>
          <div className="flex gap-1">
            {visiblePages.map((p) => (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                disabled={isLoading || p === page}
                className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                  p === page
                    ? 'bg-accent text-white'
                    : 'hover:bg-surface-tertiary'
                } disabled:opacity-50`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
