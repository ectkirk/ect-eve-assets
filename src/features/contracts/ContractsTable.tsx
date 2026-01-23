import { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
import { IngameActionModal } from '@/components/dialogs/IngameActionModal'
import { useAuthStore } from '@/store/auth-store'
import {
  ContractTableRow,
  type SelectedContractData,
  type ContractIngameAction,
  type WaypointAction,
} from './ContractTableRow'
import {
  type ContractSortColumn,
  type ContractRow,
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
  const { t } = useTranslation('common')
  const [page, setPage] = useState(0)
  const [selectedContract, setSelectedContract] =
    useState<SelectedContractData | null>(null)
  const [ingameAction, setIngameAction] = useState<{
    contractId: number
    eligibleCharacterIds: number[]
  } | null>(null)
  const [waypointAction, setWaypointAction] = useState<WaypointAction | null>(
    null
  )
  const { sortColumn, sortDirection, handleSort } =
    useSortable<ContractSortColumn>('value', 'desc')

  const authOwners = useAuthStore((s) => s.owners)

  const handleOpenContractIngame = useCallback(
    (action: ContractIngameAction) => {
      const authCharacters = Object.values(authOwners).map((o) => ({
        characterId: o.characterId,
        corporationId: o.corporationId,
      }))

      let eligibleCharacterIds: number[]

      if (action.availability === 'public') {
        eligibleCharacterIds = authCharacters.map((o) => o.characterId)
      } else if (action.ownerType === 'corporation') {
        eligibleCharacterIds = authCharacters
          .filter((o) => o.corporationId === action.ownerId)
          .map((o) => o.characterId)
      } else {
        const hasChar = authCharacters.some(
          (o) => o.characterId === action.ownerId
        )
        eligibleCharacterIds = hasChar ? [action.ownerId] : []
      }

      setIngameAction({
        contractId: action.contractId,
        eligibleCharacterIds,
      })
    },
    [authOwners]
  )

  const handleSetWaypoint = useCallback((action: WaypointAction) => {
    setWaypointAction(action)
  }, [])

  const sortedContracts = useMemo(() => {
    return sortRows(contracts, sortColumn, sortDirection, (row, column) => {
      const contract = row.contractWithItems.contract
      switch (column) {
        case 'type':
          return contract.type
        case 'items':
          return row.typeName.toLowerCase()
        case 'location':
          return row.locationName.toLowerCase()
        case 'assigner':
          return row.assignerName.toLowerCase()
        case 'assignee':
          return row.assigneeName.toLowerCase()
        case 'price':
          return getContractValue(contract, row.highestBid)
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
                label="columns.type"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('items') && (
              <SortableHeader
                column="items"
                label="columns.items"
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
            {show('assigner') && (
              <SortableHeader
                column="assigner"
                label="columns.assigner"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('assignee') && (
              <SortableHeader
                column="assignee"
                label="columns.assignee"
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
            {show('value') && (
              <SortableHeader
                column="value"
                label="columns.value"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('volume') && (
              <SortableHeader
                column="volume"
                label="columns.volume"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('collateral') && (
              <SortableHeader
                column="collateral"
                label="columns.collateral"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('days') && (
              <SortableHeader
                column="days"
                label="columns.days"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('expires') && (
              <SortableHeader
                column="expires"
                label="columns.expires"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('status') && (
              <TableHead className="text-right">
                {t('columns.status')}
              </TableHead>
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
              onOpenContractIngame={handleOpenContractIngame}
              onSetWaypoint={handleSetWaypoint}
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
      <IngameActionModal
        open={ingameAction !== null}
        onOpenChange={(open) => !open && setIngameAction(null)}
        action="contract"
        targetId={ingameAction?.contractId ?? 0}
        eligibleCharacterIds={ingameAction?.eligibleCharacterIds}
      />
      <IngameActionModal
        open={waypointAction !== null}
        onOpenChange={(open) => !open && setWaypointAction(null)}
        action="autopilot"
        targetId={waypointAction?.locationId ?? 0}
        targetName={waypointAction?.locationName}
      />
    </>
  )
}
