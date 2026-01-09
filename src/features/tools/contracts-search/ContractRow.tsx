import { useTranslation } from 'react-i18next'
import { TableRow, TableCell } from '@/components/ui/table'
import { TypeIcon } from '@/components/ui/type-icon'
import { CopyButton } from '@/components/ui/copy-button'
import {
  formatNumber,
  formatFullNumber,
  formatSecurity,
  formatPercent,
} from '@/lib/utils'
import { getType } from '@/store/reference-cache'
import { isAbyssalTypeId } from '@/store/price-store'
import type { SearchContract } from './types'
import {
  getSecurityColor,
  formatBlueprintName,
  formatTimeLeft,
  formatContractDate,
  SCAM_THRESHOLD_PCT,
  calculateContractDisplayValues,
  getItemTypeName,
  localizeSystemName,
  localizeRegionName,
} from './utils'
import { decodeHtmlEntities } from '@/features/tools/reference/eve-text-utils'

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
  const { t } = useTranslation('tools')
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
      ? t('contractsSearch.row.multipleItems')
      : displayItems[0]
        ? getItemTypeName(displayItems[0])
        : t('contractsSearch.row.empty')

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
              {t('contractsSearch.row.multipleItems')}
              <div className="text-xs text-status-negative">
                {t('contractsSearch.row.youProvide')}
              </div>
            </div>
          ) : (
            t('contractsSearch.row.multipleItems')
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
                  x{formatFullNumber(displayItem.quantity)}
                </span>
              )}
            </span>
            {showingRequested && (
              <div className="text-xs text-status-negative">
                {t('contractsSearch.row.youProvide')}
              </div>
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
                {formatSecurity(contract.securityStatus)}
              </span>{' '}
            </>
          )}
          <span className="text-content">
            {localizeSystemName(contract.systemId, contract.systemName)}
          </span>
        </div>
        <div className="text-xs text-content-muted">
          {localizeRegionName(contract.regionId, contract.regionName)}
        </div>
      </TableCell>
      <TableCell className="font-mono">
        {displayPrice != null ? (
          <>
            <span className={hasBids ? 'text-status-highlight' : ''}>
              {formatNumber(displayPrice)}
            </span>
            {isWantToBuy && (contract.reward ?? 0) > 0 && (
              <div className="text-xs text-status-positive">
                {t('contractsSearch.row.youReceive')}
              </div>
            )}
          </>
        ) : (
          '-'
        )}
        {contract.type === 'auction' &&
          contract.buyout != null &&
          contract.buyout > 0 && (
            <div className="text-xs text-status-positive">
              {t('contractsSearch.row.buyout', {
                price: formatNumber(contract.buyout),
              })}
            </div>
          )}
      </TableCell>
      <TableCell className="font-mono">
        {displayEstValue != null ? formatNumber(displayEstValue) : '-'}
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
                {isAllAbyssal
                  ? t('contractsSearch.row.rmt')
                  : t('contractsSearch.row.scam')}
              </span>
            ) : (
              `(${pct >= 0 ? '+' : ''}${formatPercent(pct)})`
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
