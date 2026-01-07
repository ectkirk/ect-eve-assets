import { useMemo, useState } from 'react'
import { useSortable, SortableHeader, sortRows } from '@/hooks'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
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

interface ContractsTableProps {
  contracts: ContractRow[]
  visibleColumns: Set<string>
}

export function ContractsTable({
  contracts,
  visibleColumns,
}: ContractsTableProps) {
  const [page, setPage] = useState(0)
  const [selectedContract, setSelectedContract] =
    useState<SelectedContractData | null>(null)
  const { sortColumn, sortDirection, handleSort } =
    useSortable<ContractSortColumn>('value', 'desc')

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
        case 'volume':
          return contract.volume ?? 0
        case 'collateral':
          return contract.collateral ?? 0
        case 'days':
          return getDaysLeft(contract)
        case 'expires':
          return new Date(contract.date_expired).getTime()
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

  const show = (col: string) => visibleColumns.has(col)

  return (
    <>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
          <TableRow className="hover:bg-transparent border-b border-border">
            {show('owner') && <TableHead className="w-8" />}
            {show('type') && (
              <SortableHeader
                column="type"
                label="Type"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('items') && (
              <SortableHeader
                column="items"
                label="Items"
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
            {show('assigner') && (
              <SortableHeader
                column="assigner"
                label="Assigner"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('assignee') && (
              <SortableHeader
                column="assignee"
                label="Assignee"
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
            {show('value') && (
              <SortableHeader
                column="value"
                label="Value"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('volume') && (
              <SortableHeader
                column="volume"
                label="Volume"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('collateral') && (
              <SortableHeader
                column="collateral"
                label="Collateral"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('days') && (
              <SortableHeader
                column="days"
                label="Days"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('expires') && (
              <SortableHeader
                column="expires"
                label="Expires"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('status') && (
              <TableHead className="text-right">Status</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedContracts.map((row) => (
            <ContractTableRow
              key={row.contractWithItems.contract.contract_id}
              row={row}
              visibleColumns={visibleColumns}
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
