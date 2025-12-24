import { useMemo, useState, useCallback } from 'react'
import { FileText } from 'lucide-react'
import { SortableHeader, sortRows } from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber } from '@/lib/utils'
import type { SearchContract, ContractSearchMode } from './types'

const PAGE_SIZE = 50

type SortColumn =
  | 'contract'
  | 'location'
  | 'price'
  | 'timeLeft'
  | 'issuer'
  | 'created'
  | 'description'

type SortDirection = 'asc' | 'desc'

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

function parsePreset(preset: SortPreset): {
  column: SortColumn
  direction: SortDirection
} {
  const [column, direction] = preset.split('-') as [SortColumn, SortDirection]
  return { column, direction }
}

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

interface ContractsResultsTableProps {
  contracts: SearchContract[]
  mode: ContractSearchMode
  sortPreset: SortPreset
  onSortPresetChange: (preset: SortPreset) => void
}

export function ContractsResultsTable({
  contracts,
  mode,
  sortPreset,
  onSortPresetChange,
}: ContractsResultsTableProps) {
  const [page, setPage] = useState(0)
  const { column: sortColumn, direction: sortDirection } =
    parsePreset(sortPreset)

  const handleSort = useCallback(
    (column: SortColumn) => {
      const newDirection =
        sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc'
      onSortPresetChange(`${column}-${newDirection}` as SortPreset)
    },
    [sortColumn, sortDirection, onSortPresetChange]
  )

  const sortedContracts = useMemo(() => {
    return sortRows(contracts, sortColumn, sortDirection, (row, column) => {
      switch (column) {
        case 'contract':
          return row.title.toLowerCase()
        case 'location':
          return row.systemName.toLowerCase()
        case 'price':
          return mode === 'courier' ? (row.reward ?? 0) : row.price
        case 'timeLeft':
          return new Date(row.dateExpired).getTime()
        case 'issuer':
          return row.issuerName.toLowerCase()
        case 'created':
          return new Date(row.dateIssued).getTime()
        case 'description':
          return row.title.toLowerCase()
        default:
          return 0
      }
    })
  }, [contracts, sortColumn, sortDirection, mode])

  const totalPages = Math.max(1, Math.ceil(sortedContracts.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const paginatedContracts = sortedContracts.slice(
    clampedPage * PAGE_SIZE,
    (clampedPage + 1) * PAGE_SIZE
  )

  if (contracts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-content-muted">
        <FileText className="mb-2 h-12 w-12 opacity-50" />
        <p>No contracts found</p>
        <p className="text-sm">Try adjusting your search filters</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
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
            {paginatedContracts.map((contract) => (
              <TableRow key={contract.contractId}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span className="capitalize text-content-secondary">
                      [{contract.type.replace('_', ' ')}]
                    </span>
                    <span className="text-xs text-content-muted">
                      ({contract.itemCount} item
                      {contract.itemCount !== 1 && 's'})
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <span className={getSecurityColor(contract.securityStatus)}>
                      {contract.securityStatus.toFixed(1)}
                    </span>{' '}
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
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <span className="text-sm text-content-secondary">
            Showing {clampedPage * PAGE_SIZE + 1}-
            {Math.min((clampedPage + 1) * PAGE_SIZE, contracts.length)} of{' '}
            {contracts.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={clampedPage === 0}
              className="rounded px-2 py-1 text-sm hover:bg-surface-tertiary disabled:opacity-50"
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="rounded px-2 py-1 text-sm hover:bg-surface-tertiary disabled:opacity-50"
            >
              Prev
            </button>
            <span className="px-2 py-1 text-sm text-content-secondary">
              {clampedPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={clampedPage >= totalPages - 1}
              className="rounded px-2 py-1 text-sm hover:bg-surface-tertiary disabled:opacity-50"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={clampedPage >= totalPages - 1}
              className="rounded px-2 py-1 text-sm hover:bg-surface-tertiary disabled:opacity-50"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
