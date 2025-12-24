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
import { AbyssalPreview } from '@/components/ui/abyssal-preview'
import { formatNumber } from '@/lib/utils'
import type { SearchContract, ContractSearchMode } from './types'

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
      if (contract.topItems.length > 0) {
        setTooltipPos({ x: e.clientX + 12, y: e.clientY + 12 })
        setHoveredContract(contract)
      }
    },
    []
  )

  const handleRowLeave = useCallback(() => {
    setTooltipPos(null)
    setHoveredContract(null)
  }, [])

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
                className="text-right"
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
                  ) : contract.topItems[0]?.itemId ? (
                    <AbyssalPreview itemId={contract.topItems[0].itemId}>
                      {contract.topItems[0].typeName}
                    </AbyssalPreview>
                  ) : (
                    contract.topItems[0]?.typeName || '-'
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
                <TableCell className="text-right font-mono">
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
                <TableCell>{getTimeLeft(contract.dateExpired)}</TableCell>
                <TableCell>{contract.issuerName}</TableCell>
                <TableCell className="text-content-secondary">
                  {formatDate(contract.dateIssued)}
                </TableCell>
                <TableCell className="max-w-xs truncate text-content-secondary">
                  {contract.title || '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {tooltipPos &&
          hoveredContract &&
          hoveredContract.topItems.length > 0 && (
            <div
              className="fixed z-50 max-h-80 min-w-48 overflow-auto rounded border border-border bg-surface-secondary p-2 shadow-lg"
              style={{ left: tooltipPos.x, top: tooltipPos.y }}
            >
              <ul className="space-y-1 text-sm">
                {hoveredContract.topItems.map((item) => (
                  <li key={item.typeId} className="text-content">
                    {item.typeName} x{item.quantity.toLocaleString()}
                  </li>
                ))}
                {hoveredContract.itemCount >
                  hoveredContract.topItems.length && (
                  <li className="text-content-muted">
                    +
                    {hoveredContract.itemCount -
                      hoveredContract.topItems.length}{' '}
                    more...
                  </li>
                )}
              </ul>
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
