import { TableRow, TableCell } from '@/components/ui/table'
import { TypeIcon } from '@/components/ui/type-icon'
import { CopyButton } from '@/components/ui/copy-button'
import { formatNumber } from '@/lib/utils'
import { getType } from '@/store/reference-cache'
import { isAbyssalTypeId } from '@/store/price-store'
import type { SearchContract } from './types'
import {
  getSecurityColor,
  formatBlueprintName,
  formatTimeLeft,
  formatContractDate,
  decodeHtmlEntities,
  SCAM_THRESHOLD_PCT,
  calculateContractDisplayValues,
} from './utils'

interface ContractRowProps {
  contract: SearchContract
  highestBid: number | undefined
  isHovered: boolean
  onMouseEnter: (contract: SearchContract, e: React.MouseEvent) => void
  onMouseLeave: () => void
  onContextMenu: (e: React.MouseEvent, contract: SearchContract) => void
}

export function ContractRow({
  contract,
  highestBid,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
}: ContractRowProps) {
  const isWantToBuy = contract.isWantToBuy === true
  const { displayPrice, displayEstValue, diff, pct, diffIsGood, hasBids } =
    calculateContractDisplayValues(contract, highestBid)

  const itemsToCheck = isWantToBuy
    ? (contract.requestedItems ?? [])
    : contract.topItems
  const isAllAbyssal =
    itemsToCheck.length > 0 &&
    itemsToCheck.every((item) => item.typeId && isAbyssalTypeId(item.typeId))

  const showingRequested = isWantToBuy && contract.topItems.length === 0
  const displayItems = showingRequested
    ? (contract.requestedItems ?? [])
    : contract.topItems
  const displayItem = displayItems[0]

  const linkName =
    displayItems.length > 1
      ? '[Multiple Items]'
      : (displayItems[0]?.typeName ?? '[Empty]')

  return (
    <TableRow
      onMouseEnter={(e) => onMouseEnter(contract, e)}
      onMouseLeave={onMouseLeave}
      onContextMenu={(e) => onContextMenu(e, contract)}
      className={isHovered ? 'bg-surface-tertiary' : ''}
    >
      <TableCell className="font-medium">
        {displayItems.length > 1 ? (
          showingRequested ? (
            <div>
              [Multiple Items]
              <div className="text-xs text-status-negative">You Provide</div>
            </div>
          ) : (
            '[Multiple Items]'
          )
        ) : !displayItem ? (
          '-'
        ) : (
          <div>
            <span className="flex items-center gap-1.5">
              {displayItem.typeId && (
                <TypeIcon
                  typeId={displayItem.typeId}
                  categoryId={getType(displayItem.typeId)?.categoryId}
                  isBlueprintCopy={displayItem.isBlueprintCopy}
                  size="sm"
                />
              )}
              {formatBlueprintName(displayItem)}
              {displayItem.quantity > 1 && (
                <span className="text-content-secondary">
                  x{displayItem.quantity.toLocaleString()}
                </span>
              )}
            </span>
            {showingRequested && (
              <div className="text-xs text-status-negative">You Provide</div>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <CopyButton
          text={`<url=contract:${contract.systemId}//${contract.contractId}>${linkName}</url>`}
          label=""
          className="border-0 bg-transparent px-1 py-0.5 hover:bg-surface-tertiary"
        />
      </TableCell>
      <TableCell>
        <div>
          {contract.securityStatus != null && (
            <>
              <span className={getSecurityColor(contract.securityStatus)}>
                {contract.securityStatus.toFixed(1)}
              </span>{' '}
            </>
          )}
          <span className="text-content">{contract.systemName}</span>
        </div>
        <div className="text-xs text-content-muted">{contract.regionName}</div>
      </TableCell>
      <TableCell className="font-mono">
        {displayPrice != null ? (
          <>
            <span className={hasBids ? 'text-status-highlight' : ''}>
              {formatNumber(displayPrice)}
            </span>{' '}
            <span className="text-content-muted">ISK</span>
            {isWantToBuy && (contract.reward ?? 0) > 0 && (
              <div className="text-xs text-status-positive">You Receive</div>
            )}
          </>
        ) : (
          '-'
        )}
        {contract.type === 'auction' &&
          contract.buyout != null &&
          contract.buyout > 0 && (
            <div className="text-xs text-status-positive">
              Buyout: {formatNumber(contract.buyout)}
            </div>
          )}
      </TableCell>
      <TableCell className="font-mono">
        {displayEstValue != null ? (
          <>
            {formatNumber(displayEstValue)}{' '}
            <span className="text-content-muted">ISK</span>
          </>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell className="font-mono">
        {diff != null && pct != null ? (
          <span
            className={
              diffIsGood
                ? 'text-status-positive'
                : diff !== 0
                  ? 'text-status-negative'
                  : 'text-content-muted'
            }
          >
            {diff >= 0 ? '+' : ''}
            {formatNumber(diff)}{' '}
            {Math.abs(pct) >= SCAM_THRESHOLD_PCT ? (
              <span className="text-status-warning">
                {isAllAbyssal ? '(RMT?)' : '(Scam?)'}
              </span>
            ) : (
              `(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`
            )}
          </span>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell>{formatTimeLeft(contract.dateExpired)}</TableCell>
      <TableCell className="text-content-secondary">
        {formatContractDate(contract.dateIssued)}
      </TableCell>
      <TableCell className="max-w-xs truncate text-content-secondary">
        {contract.title ? decodeHtmlEntities(contract.title) : '-'}
      </TableCell>
    </TableRow>
  )
}
