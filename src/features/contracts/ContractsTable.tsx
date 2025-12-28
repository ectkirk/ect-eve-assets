import { useMemo, useState } from 'react'
import { useSortable, SortableHeader, sortRows } from '@/hooks'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/table'
import { ContractDetailModal } from '@/features/tools/contracts-search/ContractDetailModal'
import { ContractTableRow, type SelectedContractData } from './ContractTableRow'
import {
  type ContractSortColumn,
  type ContractRow,
  CONTRACT_TYPE_NAMES,
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
}: {
  contracts: ContractRow[]
  showCourierColumns?: boolean
}) {
  const [page, setPage] = useState(0)
  const [selectedContract, setSelectedContract] =
    useState<SelectedContractData | null>(null)
  const { sortColumn, sortDirection, handleSort } =
    useSortable<ContractSortColumn>(getDefaultSort(showCourierColumns), 'desc')

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
            <th scope="col" className="w-8"></th>
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
            <th scope="col" className="text-right">
              Status
            </th>
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
      {selectedContract && (
        <ContractDetailModal
          contract={selectedContract.display}
          preloadedItems={selectedContract.items}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </>
  )
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
        {page * pageSize + 1}-{Math.min((page + 1) * pageSize, totalItems)} of{' '}
        {totalItems}
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
