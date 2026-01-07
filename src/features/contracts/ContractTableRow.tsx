import { TableCell, TableRow } from '@/components/ui/table'
import { cn, formatNumber } from '@/lib/utils'
import { TypeIcon as ItemTypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { resolveContractItems, type ContractItem } from '@/lib/contract-items'
import type { DisplayContract } from '@/features/tools/contracts-search/ContractDetailModal'
import {
  type ContractRow,
  CONTRACT_TYPE_NAMES,
  formatExpiry,
  getContractValue,
} from './contracts-utils'

export interface SelectedContractData {
  display: DisplayContract
  items: ContractItem[]
}

function toDisplayContract(row: ContractRow): SelectedContractData {
  const contract = row.contractWithItems.contract
  const items = row.items

  const topItemName =
    contract.type === 'courier'
      ? 'Courier Contract'
      : items.length > 1
        ? '[Multiple Items]'
        : items.length === 1
          ? row.typeName
          : '[Empty]'

  const display: DisplayContract = {
    contractId: contract.contract_id,
    type: contract.type,
    title: contract.title,
    assigneeName: row.assigneeName,
    locationName: row.locationName,
    endLocationName: row.endLocationName || undefined,
    dateIssued: contract.date_issued,
    dateExpired: contract.date_expired,
    price: contract.price ?? 0,
    reward: contract.reward,
    collateral: contract.collateral,
    volume: contract.volume,
    daysToComplete: contract.days_to_complete,
    status: contract.status,
    availability: contract.availability,
    topItemName,
  }

  const resolvedItems = resolveContractItems(items)

  return { display, items: resolvedItems }
}

function WantToBuyLabel({ direction }: { direction: 'in' | 'out' }) {
  return (
    <div
      className={cn(
        'text-xs',
        direction === 'in' ? 'text-status-negative' : 'text-status-info'
      )}
    >
      {direction === 'in' ? 'You Provide' : 'You Want'}
    </div>
  )
}

interface ContractTableRowProps {
  row: ContractRow
  visibleColumns: Set<string>
  onSelectContract: (data: SelectedContractData) => void
}

export function ContractTableRow({
  row,
  visibleColumns,
  onSelectContract,
}: ContractTableRowProps) {
  const contract = row.contractWithItems.contract
  const expiry = formatExpiry(contract.date_expired)
  const value = getContractValue(contract)

  const displayItemCount = row.isWantToBuy
    ? row.requestedItemCount
    : row.includedItemCount
  const hasMultipleItems = displayItemCount > 1

  const show = (col: string) => visibleColumns.has(col)

  return (
    <TableRow className="border-b border-border/50 hover:bg-surface-tertiary/50">
      {show('owner') && (
        <TableCell className="py-1.5 w-8">
          <OwnerIcon
            ownerId={row.ownerId}
            ownerType={row.ownerType}
            size="sm"
          />
        </TableCell>
      )}
      {show('type') && (
        <TableCell className="py-1.5">
          {CONTRACT_TYPE_NAMES[contract.type]}
        </TableCell>
      )}
      {show('items') && (
        <TableCell className="py-1.5">
          {contract.type === 'courier' ? (
            <button
              onClick={() => onSelectContract(toDisplayContract(row))}
              className="hover:text-link text-accent"
            >
              Courier
            </button>
          ) : displayItemCount === 0 ? (
            <span className="text-content-muted">-</span>
          ) : (
            <div>
              <button
                onClick={() => onSelectContract(toDisplayContract(row))}
                className="flex items-center gap-2 hover:text-link text-accent"
              >
                {hasMultipleItems ? (
                  <span>[Multiple Items]</span>
                ) : (
                  <>
                    {row.firstItemTypeId && (
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
                      {row.typeName}
                    </span>
                  </>
                )}
              </button>
              {row.isWantToBuy && <WantToBuyLabel direction={row.direction} />}
            </div>
          )}
        </TableCell>
      )}
      {show('location') && (
        <TableCell className="py-1.5 text-content-secondary">
          <span className="truncate" title={row.locationName}>
            {row.locationName}
          </span>
          {contract.type === 'courier' && row.endLocationName && (
            <span className="text-content-muted"> → {row.endLocationName}</span>
          )}
        </TableCell>
      )}
      {show('assigner') && (
        <TableCell className="py-1.5 text-content-secondary">
          {row.assignerName}
        </TableCell>
      )}
      {show('assignee') && (
        <TableCell className="py-1.5 text-content-secondary">
          {row.assigneeName}
        </TableCell>
      )}
      {show('price') && (
        <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
          {value > 0 ? (
            <div>
              <div>{formatNumber(value)}</div>
              {row.isWantToBuy && row.direction === 'in' && (
                <div className="text-xs text-status-positive">You Receive</div>
              )}
            </div>
          ) : (
            '-'
          )}
        </TableCell>
      )}
      {show('value') && (
        <TableCell className="py-1.5 text-right tabular-nums text-status-positive">
          {row.itemValue > 0 ? formatNumber(row.itemValue) : '-'}
        </TableCell>
      )}
      {show('volume') && (
        <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
          {contract.volume ? `${contract.volume.toLocaleString()} m³` : '-'}
        </TableCell>
      )}
      {show('collateral') && (
        <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
          {contract.collateral ? formatNumber(contract.collateral) : '-'}
        </TableCell>
      )}
      {show('days') && <DaysCell contract={contract} />}
      {show('expires') && (
        <TableCell
          className={cn(
            'py-1.5 text-right tabular-nums',
            expiry.isExpired ? 'text-status-negative' : 'text-content-secondary'
          )}
        >
          {expiry.text}
        </TableCell>
      )}
      {show('status') && (
        <TableCell className="py-1.5 text-right">
          <ContractStatus status={row.status} />
        </TableCell>
      )}
    </TableRow>
  )
}

function DaysCell({
  contract,
}: {
  contract: ContractRow['contractWithItems']['contract']
}) {
  if (contract.type !== 'courier' || !contract.days_to_complete) {
    return (
      <TableCell className="py-1.5 text-right tabular-nums text-content-muted">
        -
      </TableCell>
    )
  }

  return (
    <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
      {contract.days_to_complete}d
    </TableCell>
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
