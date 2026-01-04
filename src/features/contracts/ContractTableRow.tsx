import { useState, useEffect } from 'react'
import { Package } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn, formatNumber } from '@/lib/utils'
import { TypeIcon as ItemTypeIcon } from '@/components/ui/type-icon'
import { resolveContractItems, type ContractItem } from '@/lib/contract-items'
import type { DisplayContract } from '@/features/tools/contracts-search/ContractDetailModal'
import {
  type ContractRow,
  CONTRACT_TYPE_NAMES,
  CONTRACT_TYPE_ICONS,
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
    items.length > 1
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
    status: contract.status,
    availability: contract.availability,
    topItemName,
  }

  const resolvedItems = resolveContractItems(items)

  return { display, items: resolvedItems }
}

interface ContractTableRowProps {
  row: ContractRow
  showCourierColumns: boolean
  onSelectContract: (data: SelectedContractData) => void
}

export function ContractTableRow({
  row,
  showCourierColumns,
  onSelectContract,
}: ContractTableRowProps) {
  const contract = row.contractWithItems.contract
  const TypeIcon = CONTRACT_TYPE_ICONS[contract.type]
  const expiry = formatExpiry(contract.date_expired)
  const value = getContractValue(contract)

  const displayItemCount = row.isWantToBuy
    ? row.requestedItemCount
    : row.includedItemCount
  const hasMultipleItems = displayItemCount > 1

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
          {hasMultipleItems ? (
            <div>
              <button
                onClick={() => onSelectContract(toDisplayContract(row))}
                className="flex items-center gap-1.5 hover:text-link text-accent"
              >
                <Package className="h-4 w-4" />
                <span>[Multiple Items]</span>
              </button>
              {row.isWantToBuy && (
                <div
                  className={cn(
                    'text-xs',
                    row.direction === 'in'
                      ? 'text-status-negative'
                      : 'text-status-info'
                  )}
                >
                  {row.direction === 'in' ? 'You Provide' : 'You Want'}
                </div>
              )}
            </div>
          ) : displayItemCount === 0 ? (
            <span className="text-content-muted">-</span>
          ) : (
            <div>
              <div className="flex items-center gap-2">
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
              </div>
              {row.isWantToBuy && (
                <div
                  className={cn(
                    'text-xs',
                    row.direction === 'in'
                      ? 'text-status-negative'
                      : 'text-status-info'
                  )}
                >
                  {row.direction === 'in' ? 'You Provide' : 'You Want'}
                </div>
              )}
            </div>
          )}
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

function computeDaysDisplay(
  contract: ContractRow['contractWithItems']['contract']
): { display: string; color: string } {
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
    const deadline =
      acceptedDate + contract.days_to_complete * 24 * 60 * 60 * 1000
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

function CourierColumns({
  contract,
}: {
  contract: ContractRow['contractWithItems']['contract']
}) {
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
