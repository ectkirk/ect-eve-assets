import { useState, useMemo } from 'react'
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { type Owner } from '@/store/auth-store'
import {
  type JournalEntry,
  DEFAULT_WALLET_NAMES,
} from '@/store/wallet-journal-store'
import { OwnerIcon } from '@/components/ui/type-icon'
import { cn, formatISK } from '@/lib/utils'
import { useSortable, SortableHeader, sortRows } from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type JournalSortColumn =
  | 'date'
  | 'type'
  | 'description'
  | 'division'
  | 'amount'
  | 'balance'

const PAGE_SIZE = 50

function formatRefType(refType: string): string {
  return refType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface JournalEntryWithOwner extends JournalEntry {
  owner: Owner
}

interface JournalTableProps {
  entries: JournalEntryWithOwner[]
  showOwner?: boolean
  showDivision?: boolean
  getWalletName?: (corpId: number, division: number) => string | undefined
  corporationId?: number
}

export function JournalTable({
  entries,
  showOwner = false,
  showDivision = false,
  getWalletName,
  corporationId,
}: JournalTableProps) {
  const [page, setPage] = useState(0)
  const { sortColumn, sortDirection, handleSort } =
    useSortable<JournalSortColumn>('date', 'desc')

  const sortedEntries = useMemo(() => {
    return sortRows(entries, sortColumn, sortDirection, (entry, column) => {
      switch (column) {
        case 'date':
          return new Date(entry.date).getTime()
        case 'type':
          return entry.ref_type.toLowerCase()
        case 'description':
          return entry.description.toLowerCase()
        case 'division':
          return entry.division ?? 0
        case 'amount':
          return entry.amount ?? 0
        case 'balance':
          return entry.balance ?? 0
        default:
          return 0
      }
    })
  }, [entries, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const paginatedEntries = sortedEntries.slice(
    clampedPage * PAGE_SIZE,
    (clampedPage + 1) * PAGE_SIZE
  )

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-content-secondary">
        No journal entries
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {showOwner && <th className="w-8"></th>}
            <SortableHeader
              column="date"
              label="Date"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="w-32"
            />
            <SortableHeader
              column="type"
              label="Type"
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
              className="max-w-md"
            />
            {showDivision && (
              <SortableHeader
                column="division"
                label="Division"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="w-32"
              />
            )}
            <SortableHeader
              column="amount"
              label="Amount"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right w-36"
            />
            <SortableHeader
              column="balance"
              label="Balance"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right w-36"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEntries.map((entry) => {
            const isPositive = (entry.amount ?? 0) >= 0
            const corpId =
              corporationId ??
              (entry.owner.type === 'corporation' ? entry.owner.id : undefined)
            const divisionName =
              showDivision && entry.division
                ? (getWalletName && corpId
                    ? getWalletName(corpId, entry.division)
                    : null) || DEFAULT_WALLET_NAMES[entry.division - 1]
                : undefined

            return (
              <TableRow
                key={`${entry.owner.type}-${entry.owner.id}-${entry.division ?? 0}-${entry.id}`}
              >
                {showOwner && (
                  <TableCell className="py-1.5 w-8">
                    <OwnerIcon
                      ownerId={entry.owner.id}
                      ownerType={entry.owner.type}
                      size="sm"
                    />
                  </TableCell>
                )}
                <TableCell className="py-1.5 text-content-secondary text-xs">
                  {formatDate(entry.date)}
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    {isPositive ? (
                      <ArrowDownLeft className="h-3.5 w-3.5 text-status-positive" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 text-status-negative" />
                    )}
                    <span className="text-xs">
                      {formatRefType(entry.ref_type)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 max-w-md">
                  <span
                    className="text-content-secondary text-xs truncate block"
                    title={entry.description}
                  >
                    {entry.description}
                  </span>
                </TableCell>
                {showDivision && (
                  <TableCell className="py-1.5 text-content-secondary text-xs">
                    {divisionName}
                  </TableCell>
                )}
                <TableCell
                  className={cn(
                    'py-1.5 text-right tabular-nums text-xs',
                    isPositive ? 'text-status-positive' : 'text-status-negative'
                  )}
                >
                  {entry.amount !== undefined ? formatISK(entry.amount) : '-'}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums text-xs text-content-secondary">
                  {entry.balance !== undefined ? formatISK(entry.balance) : '-'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-2 text-sm border-t border-border/50">
          <span className="text-content-secondary text-xs">
            {clampedPage * PAGE_SIZE + 1}-
            {Math.min((clampedPage + 1) * PAGE_SIZE, sortedEntries.length)} of{' '}
            {sortedEntries.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={clampedPage === 0}
              className="px-2 py-1 rounded text-xs hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => setPage(clampedPage - 1)}
              disabled={clampedPage === 0}
              className="px-2 py-1 rounded text-xs hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="px-2 py-1 text-content-secondary text-xs">
              {clampedPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(clampedPage + 1)}
              disabled={clampedPage >= totalPages - 1}
              className="px-2 py-1 rounded text-xs hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={clampedPage >= totalPages - 1}
              className="px-2 py-1 rounded text-xs hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </>
  )
}
