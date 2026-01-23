import { useTranslation } from 'react-i18next'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn, formatNumber, formatVolume } from '@/lib/utils'
import { TypeIcon as ItemTypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { resolveContractItems, type ContractItem } from '@/lib/contract-items'
import type { DisplayContract } from '@/features/tools/contracts-search/ContractDetailModal'
import {
  type ContractRow,
  getContractValue,
  getContractTypeName,
  getTimeRemaining,
  getCourierTimeRemaining,
} from './contracts-utils'

export interface SelectedContractData {
  display: DisplayContract
  items: ContractItem[]
}

function toDisplayContract(
  row: ContractRow,
  t: (key: string) => string
): SelectedContractData {
  const contract = row.contractWithItems.contract
  const items = row.items

  const topItemName =
    contract.type === 'courier'
      ? t('items.courierContract')
      : items.length > 1
        ? t('items.multipleItems')
        : items.length === 1
          ? row.typeName
          : t('items.empty')

  const display: DisplayContract = {
    contractId: contract.contract_id,
    type: contract.type,
    title: contract.title,
    assigneeName: row.assigneeName,
    locationName: row.locationName,
    endLocationName: row.endLocationName || undefined,
    dateIssued: contract.date_issued,
    dateExpired: contract.date_expired,
    dateAccepted: contract.date_accepted,
    price: contract.price ?? 0,
    reward: contract.reward,
    collateral: contract.collateral,
    volume: contract.volume,
    daysToComplete: contract.days_to_complete,
    status: contract.status,
    availability: contract.availability,
    topItemName,
    isWantToBuy: row.isWantToBuy,
    currentBid: row.highestBid,
    isIssuer: row.direction === 'out',
  }

  const resolvedItems = resolveContractItems(items, contract.availability)

  return { display, items: resolvedItems }
}

function WantToBuyLabel({ direction }: { direction: 'in' | 'out' }) {
  const { t } = useTranslation('contracts')
  return (
    <div
      className={cn(
        'text-xs',
        direction === 'in' ? 'text-status-negative' : 'text-status-info'
      )}
    >
      {direction === 'in' ? t('direction.youProvide') : t('direction.youWant')}
    </div>
  )
}

export interface ContractIngameAction {
  contractId: number
  ownerId: number
  ownerType: 'character' | 'corporation'
  availability: string
}

export interface WaypointAction {
  locationId: number
  locationName: string
}

interface ContractTableRowProps {
  row: ContractRow
  visibleColumns: Set<string>
  onSelectContract: (data: SelectedContractData) => void
  onOpenContractIngame: (action: ContractIngameAction) => void
  onSetWaypoint: (action: WaypointAction) => void
}

export function ContractTableRow({
  row,
  visibleColumns,
  onSelectContract,
  onOpenContractIngame,
  onSetWaypoint,
}: ContractTableRowProps) {
  const { t } = useTranslation('contracts')
  const { t: tCommon } = useTranslation('common')
  const contract = row.contractWithItems.contract
  const expiryTime = getTimeRemaining(contract.date_expired)
  const value = getContractValue(contract, row.highestBid)

  const displayItemCount = row.isWantToBuy
    ? row.requestedItemCount
    : row.includedItemCount
  const hasMultipleItems = displayItemCount > 1

  const show = (col: string) => visibleColumns.has(col)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
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
              {getContractTypeName(contract.type, t)}
            </TableCell>
          )}
          {show('items') && (
            <TableCell className="py-1.5">
              {contract.type === 'courier' ? (
                <button
                  onClick={() => onSelectContract(toDisplayContract(row, t))}
                  className="hover:text-link text-accent"
                >
                  {t('types.courier')}
                </button>
              ) : displayItemCount === 0 ? (
                <span className="text-content-muted">-</span>
              ) : (
                <div>
                  <button
                    onClick={() => onSelectContract(toDisplayContract(row, t))}
                    className="flex items-center gap-2 hover:text-link text-accent"
                  >
                    {hasMultipleItems ? (
                      <span>{t('items.multipleItems')}</span>
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
                            row.firstItemIsBlueprintCopy &&
                              'text-status-special'
                          )}
                          title={row.typeName}
                        >
                          {row.typeName}
                        </span>
                      </>
                    )}
                  </button>
                  {row.isWantToBuy && (
                    <WantToBuyLabel direction={row.direction} />
                  )}
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
                <span className="text-content-muted">
                  {' '}
                  → {row.endLocationName}
                </span>
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
            <TableCell
              className={cn(
                'py-1.5 text-right tabular-nums',
                value < 0 ? 'text-status-negative' : 'text-status-highlight'
              )}
            >
              {value !== 0 ? (
                <div>
                  <div>{formatNumber(value)}</div>
                  {row.isWantToBuy && row.direction === 'in' && (
                    <div className="text-xs text-status-positive">
                      {t('direction.youReceive')}
                    </div>
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
              {contract.volume
                ? formatVolume(contract.volume, { suffix: true })
                : '-'}
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
                expiryTime.expired
                  ? 'text-status-negative'
                  : 'text-content-secondary'
              )}
            >
              {contract.type === 'courier' && contract.status === 'in_progress'
                ? '-'
                : expiryTime.expired
                  ? tCommon('time.expired')
                  : tCommon('time.daysHours', {
                      days: expiryTime.days,
                      hours: expiryTime.hours,
                    })}
            </TableCell>
          )}
          {show('status') && (
            <TableCell className="py-1.5 text-right">
              <ContractStatus status={row.status} />
            </TableCell>
          )}
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onClick={() =>
            onOpenContractIngame({
              contractId: contract.contract_id,
              ownerId: row.ownerId,
              ownerType: row.ownerType,
              availability: contract.availability,
            })
          }
        >
          {tCommon('contextMenu.openContractIngame')}
        </ContextMenuItem>
        {contract.start_location_id && (
          <ContextMenuItem
            onClick={() =>
              onSetWaypoint({
                locationId: contract.start_location_id!,
                locationName: row.locationName,
              })
            }
          >
            {tCommon('contextMenu.setWaypoint')}
          </ContextMenuItem>
        )}
        {contract.type === 'courier' && contract.end_location_id && (
          <ContextMenuItem
            onClick={() =>
              onSetWaypoint({
                locationId: contract.end_location_id!,
                locationName: row.endLocationName,
              })
            }
          >
            {tCommon('contextMenu.setWaypointDestination')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function DaysCell({
  contract,
}: {
  contract: ContractRow['contractWithItems']['contract']
}) {
  const { t: tc } = useTranslation('common')

  if (contract.type !== 'courier' || !contract.days_to_complete) {
    return (
      <TableCell className="py-1.5 text-right tabular-nums text-content-muted">
        -
      </TableCell>
    )
  }

  if (contract.status === 'in_progress') {
    const remaining = getCourierTimeRemaining(
      contract.date_accepted,
      contract.days_to_complete
    )
    if (!remaining || remaining.expired) {
      return (
        <TableCell className="py-1.5 text-right tabular-nums text-status-negative">
          {tc('time.expired')}
        </TableCell>
      )
    }
    const isUrgent =
      remaining.days === 0 || (remaining.days === 1 && remaining.hours < 12)
    return (
      <TableCell
        className={cn(
          'py-1.5 text-right tabular-nums',
          isUrgent ? 'text-status-negative' : 'text-content-secondary'
        )}
      >
        {tc('time.daysHours', { days: remaining.days, hours: remaining.hours })}
      </TableCell>
    )
  }

  return (
    <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
      {tc('time.days', { count: contract.days_to_complete })}
    </TableCell>
  )
}

const STATUS_CONFIG: Record<
  string,
  { key: string; className: string } | undefined
> = {
  outstanding: {
    key: 'status.outstanding',
    className: 'text-status-highlight',
  },
  in_progress: { key: 'status.inProgress', className: 'text-status-info' },
  finished: { key: 'status.finished', className: 'text-status-positive' },
  finished_issuer: {
    key: 'status.finished',
    className: 'text-status-positive',
  },
  finished_contractor: {
    key: 'status.finished',
    className: 'text-status-positive',
  },
  cancelled: { key: 'status.cancelled', className: 'text-content-secondary' },
  rejected: { key: 'status.rejected', className: 'text-status-negative' },
  failed: { key: 'status.failed', className: 'text-status-negative' },
  deleted: { key: 'status.deleted', className: 'text-content-muted' },
  reversed: { key: 'status.reversed', className: 'text-status-warning' },
}

function ContractStatus({ status }: { status: ContractRow['status'] }) {
  const { t } = useTranslation('contracts')
  const config = STATUS_CONFIG[status]
  if (!config) return null
  return <span className={config.className}>{t(config.key)}</span>
}
