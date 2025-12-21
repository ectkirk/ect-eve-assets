import { useMemo, useState, useEffect } from 'react'
import { Package } from 'lucide-react'
import {
  useSortable,
  SortableHeader,
  sortRows,
} from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatNumber } from '@/lib/utils'
import { TypeIcon as ItemTypeIcon } from '@/components/ui/type-icon'
import { ContractItemsDialog } from '@/components/dialogs/ContractItemsDialog'
import {
  type ContractSortColumn,
  type ContractRow,
  CONTRACT_TYPE_NAMES,
  CONTRACT_TYPE_ICONS,
  formatExpiry,
  getContractValue,
  getDaysLeft,
} from './contracts-utils'

const PAGE_SIZE = 50

function getDefaultSort(showCourierColumns: boolean): ContractSortColumn {
  return showCourierColumns ? 'price' : 'value'
}

export function ContractsTable({
  contracts,
  showCourierColumns = false,
  prices,
}: {
  contracts: ContractRow[]
  showCourierColumns?: boolean
  prices: Map<number, number>
}) {
  const [page, setPage] = useState(0)
  const [selectedContract, setSelectedContract] = useState<ContractRow | null>(null)
  const { sortColumn, sortDirection, handleSort } = useSortable<ContractSortColumn>(
    getDefaultSort(showCourierColumns),
    'desc'
  )

  const sortedContracts = useMemo(() => {
    return sortRows(contracts, sortColumn, sortDirection, (row, column) => {
      const contract = row.contractWithItems.contract
      switch (column) {
        case 'type':
          return CONTRACT_TYPE_NAMES[contract.type].toLowerCase()
        case 'items':
          return row.typeName.toLowerCase()
        case 'location':
          return row.locationName.toLowerCase()
        case 'assigner':
          return row.assignerName.toLowerCase()
        case 'assignee':
          return row.assigneeName.toLowerCase()
        case 'price':
          return getContractValue(contract)
        case 'value':
          return row.itemValue
        case 'expires':
          return new Date(contract.date_expired).getTime()
        case 'volume':
          return contract.volume ?? 0
        case 'collateral':
          return contract.collateral ?? 0
        case 'days':
          return getDaysLeft(contract)
        default:
          return 0
      }
    })
  }, [contracts, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedContracts.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const paginatedContracts = sortedContracts.slice(
    clampedPage * PAGE_SIZE,
    (clampedPage + 1) * PAGE_SIZE
  )

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <th className="w-8"></th>
            <SortableHeader
              column="type"
              label="Type"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            {!showCourierColumns && (
              <SortableHeader
                column="items"
                label="Items"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            <SortableHeader
              column="location"
              label="Location"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              column="assigner"
              label="Assigner"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              column="assignee"
              label="Assignee"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
            <SortableHeader
              column="price"
              label="Price"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              className="text-right"
            />
            {!showCourierColumns && (
              <SortableHeader
                column="value"
                label="Value"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {showCourierColumns && (
              <>
                <SortableHeader
                  column="volume"
                  label="Volume"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  column="collateral"
                  label="Collateral"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  column="days"
                  label="Days Left"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className="text-right"
                />
              </>
            )}
            {!showCourierColumns && (
              <SortableHeader
                column="expires"
                label="Expires"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            <th className="text-right">Status</th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedContracts.map((row) => (
            <ContractTableRow
              key={row.contractWithItems.contract.contract_id}
              row={row}
              showCourierColumns={showCourierColumns}
              onSelectContract={setSelectedContract}
            />
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <Pagination
          page={clampedPage}
          totalPages={totalPages}
          totalItems={sortedContracts.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
      <ContractItemsDialog
        open={selectedContract !== null}
        onOpenChange={(open) => !open && setSelectedContract(null)}
        items={selectedContract?.items ?? []}
        contractType={
          selectedContract
            ? CONTRACT_TYPE_NAMES[selectedContract.contractWithItems.contract.type]
            : ''
        }
        prices={prices}
      />
    </>
  )
}

function ContractTableRow({
  row,
  showCourierColumns,
  onSelectContract,
}: {
  row: ContractRow
  showCourierColumns: boolean
  onSelectContract: (row: ContractRow) => void
}) {
  const contract = row.contractWithItems.contract
  const items = row.items
  const TypeIcon = CONTRACT_TYPE_ICONS[contract.type]
  const expiry = formatExpiry(contract.date_expired)
  const value = getContractValue(contract)
  const hasMultipleItems = items.length > 1

  return (
    <TableRow>
      <TableCell className="py-1.5 w-8">
        <img
          src={
            row.ownerType === 'corporation'
              ? `https://images.evetech.net/corporations/${row.ownerId}/logo?size=32`
              : `https://images.evetech.net/characters/${row.ownerId}/portrait?size=32`
          }
          alt=""
          className="size-6 rounded object-cover"
        />
      </TableCell>
      <TableCell className="py-1.5">
        <div className="flex items-center gap-2">
          <TypeIcon className="h-4 w-4 text-content-secondary" />
          <span>{CONTRACT_TYPE_NAMES[contract.type]}</span>
        </div>
      </TableCell>
      {!showCourierColumns && (
        <TableCell className="py-1.5">
          <div className="flex items-center gap-2">
            {hasMultipleItems ? (
              <button
                onClick={() => onSelectContract(row)}
                className="flex items-center gap-1.5 hover:text-link text-accent"
              >
                <Package className="h-4 w-4" />
                <span>[Multiple Items]</span>
              </button>
            ) : (
              <>
                {items.length === 1 && row.firstItemTypeId && (
                  <ItemTypeIcon
                    typeId={row.firstItemTypeId}
                    categoryId={row.firstItemCategoryId}
                    isBlueprintCopy={row.firstItemIsBlueprintCopy}
                  />
                )}
                <span
                  className={cn(
                    'truncate',
                    row.firstItemIsBlueprintCopy && 'text-status-special'
                  )}
                  title={row.typeName}
                >
                  {items.length === 0 ? '' : row.typeName}
                </span>
              </>
            )}
          </div>
        </TableCell>
      )}
      <TableCell className="py-1.5 text-content-secondary">
        <span className="truncate" title={row.locationName}>
          {row.locationName}
        </span>
        {contract.type === 'courier' && row.endLocationName && (
          <span className="text-content-muted"> → {row.endLocationName}</span>
        )}
      </TableCell>
      <TableCell className="py-1.5 text-content-secondary">
        {row.assignerName}
      </TableCell>
      <TableCell className="py-1.5 text-content-secondary">
        {row.assigneeName}
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
        {value > 0 ? formatNumber(value) : '-'}
      </TableCell>
      {!showCourierColumns && (
        <TableCell className="py-1.5 text-right tabular-nums text-status-positive">
          {row.itemValue > 0 ? formatNumber(row.itemValue) : '-'}
        </TableCell>
      )}
      {showCourierColumns && <CourierColumns contract={contract} />}
      {!showCourierColumns && (
        <TableCell
          className={cn(
            'py-1.5 text-right tabular-nums',
            expiry.isExpired ? 'text-status-negative' : 'text-content-secondary'
          )}
        >
          {expiry.text}
        </TableCell>
      )}
      <TableCell className="py-1.5 text-right">
        <ContractStatus status={row.status} />
      </TableCell>
    </TableRow>
  )
}

function computeDaysDisplay(contract: ContractRow['contractWithItems']['contract']): { display: string; color: string } {
  const now = Date.now()
  let display = '-'
  let color = 'text-content-secondary'

  if (contract.status === 'outstanding') {
    const expiryTime = new Date(contract.date_expired).getTime()
    const remaining = expiryTime - now
    const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000))
    if (daysLeft <= 0) {
      display = 'Expired'
      color = 'text-status-negative'
    } else {
      display = `${daysLeft}d`
      color =
        daysLeft <= 1
          ? 'text-status-negative'
          : daysLeft <= 3
            ? 'text-status-highlight'
            : 'text-content-secondary'
    }
  } else if (
    contract.status === 'in_progress' &&
    contract.date_accepted &&
    contract.days_to_complete
  ) {
    const acceptedDate = new Date(contract.date_accepted).getTime()
    const deadline = acceptedDate + contract.days_to_complete * 24 * 60 * 60 * 1000
    const remaining = deadline - now
    const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000))
    display = daysLeft > 0 ? `${daysLeft}d` : 'Overdue'
    color =
      daysLeft <= 1
        ? 'text-status-negative'
        : daysLeft <= 3
          ? 'text-status-highlight'
          : 'text-content-secondary'
  }

  return { display, color }
}

function CourierColumns({ contract }: { contract: ContractRow['contractWithItems']['contract'] }) {
  const [daysInfo, setDaysInfo] = useState(() => computeDaysDisplay(contract))

  useEffect(() => {
    setDaysInfo(computeDaysDisplay(contract))
  }, [contract])

  const { display: daysDisplay, color: daysColor } = daysInfo

  return (
    <>
      <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
        {contract.volume ? `${contract.volume.toLocaleString()} m³` : '-'}
      </TableCell>
      <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
        {contract.collateral ? formatNumber(contract.collateral) : '-'}
      </TableCell>
      <TableCell className={cn('py-1.5 text-right tabular-nums', daysColor)}>
        {daysDisplay}
      </TableCell>
    </>
  )
}

function ContractStatus({ status }: { status: ContractRow['status'] }) {
  switch (status) {
    case 'outstanding':
      return <span className="text-status-highlight">Outstanding</span>
    case 'in_progress':
      return <span className="text-status-info">In Progress</span>
    case 'finished':
    case 'finished_issuer':
    case 'finished_contractor':
      return <span className="text-status-positive">Finished</span>
    case 'cancelled':
      return <span className="text-content-secondary">Cancelled</span>
    case 'rejected':
      return <span className="text-status-negative">Rejected</span>
    case 'failed':
      return <span className="text-status-negative">Failed</span>
    case 'deleted':
      return <span className="text-content-muted">Deleted</span>
    case 'reversed':
      return <span className="text-status-warning">Reversed</span>
    default:
      return null
  }
}

function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-between px-2 py-2 text-sm">
      <span className="text-content-secondary">
        {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalItems)} of {totalItems}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(0)}
          disabled={page === 0}
          className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          First
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <span className="px-2 py-1 text-content-secondary">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
        <button
          onClick={() => onPageChange(totalPages - 1)}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Last
        </button>
      </div>
    </div>
  )
}
