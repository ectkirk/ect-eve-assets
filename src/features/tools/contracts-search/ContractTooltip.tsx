import { forwardRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getSecurityColor,
  formatBlueprintName,
  localizeSystemName,
} from './utils'
import { formatFullNumber, formatSecurity } from '@/lib/utils'
import { decodeHtmlEntities } from '@/features/tools/reference/eve-text-utils'
import { usePriceStore } from '@/store/price-store'
import type { SearchContract } from './types'

const TOOLTIP_ITEM_LIMIT = 2

interface ContractTooltipProps {
  contract: SearchContract
  position: { x: number; y: number } | null
  visible: boolean
}

export const ContractTooltip = forwardRef<HTMLDivElement, ContractTooltipProps>(
  function ContractTooltip({ contract, position, visible }, ref) {
    const { t } = useTranslation('tools')
    const getItemPrice = usePriceStore((s) => s.getItemPrice)

    const displayItems = useMemo(() => {
      if (contract.topItems.length <= TOOLTIP_ITEM_LIMIT) {
        return contract.topItems
      }
      return [...contract.topItems]
        .sort((a, b) => {
          const aPrice = a.typeId ? getItemPrice(a.typeId) * a.quantity : 0
          const bPrice = b.typeId ? getItemPrice(b.typeId) * b.quantity : 0
          return bPrice - aPrice
        })
        .slice(0, TOOLTIP_ITEM_LIMIT)
    }, [contract.topItems, getItemPrice])

    const hasMore = contract.topItems.length > TOOLTIP_ITEM_LIMIT

    if (contract.topItems.length === 0) return null

    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-56 rounded border border-border bg-surface-secondary p-3 shadow-lg"
        style={{
          left: position?.x ?? 0,
          top: position?.y ?? 0,
          visibility: visible ? 'visible' : 'hidden',
        }}
      >
        <div className="mb-2 font-medium text-amber-400">
          {contract.topItems.length > 1
            ? t('contractsSearch.row.multipleItems')
            : contract.topItems[0]
              ? formatBlueprintName(contract.topItems[0])
              : '-'}
        </div>
        <div className="space-y-1 text-sm">
          <div>
            <span className="text-content-muted">
              {t('contractsSearch.tooltip.contractType')}{' '}
            </span>
            <span className="text-content">
              {t(
                `contractsSearch.types.${contract.type === 'item_exchange' ? 'itemExchange' : contract.type}`
              )}
            </span>
          </div>
          <div>
            <span className="text-content-muted">
              {t('contractsSearch.tooltip.location')}{' '}
            </span>
            <span className="text-content">
              {localizeSystemName(contract.systemId, contract.systemName)}
              {contract.securityStatus != null && (
                <span
                  className={`ml-1 ${getSecurityColor(contract.securityStatus)}`}
                >
                  ({formatSecurity(contract.securityStatus)})
                </span>
              )}
            </span>
          </div>
          {contract.title && (
            <div>
              <span className="text-content-muted">
                {t('contractsSearch.tooltip.descriptionByIssuer')}{' '}
              </span>
              <span className="text-content">
                {decodeHtmlEntities(contract.title)}
              </span>
            </div>
          )}
          <div className="mt-2">
            <span className="text-content-muted">
              {t('contractsSearch.tooltip.items')}
            </span>
            <ul className="ml-2 mt-1 space-y-0.5">
              {displayItems.map((item, idx) => (
                <li key={item.typeId ?? idx} className="text-content">
                  {formatFullNumber(item.quantity)} x{' '}
                  {formatBlueprintName(item)}
                </li>
              ))}
              {hasMore && (
                <li className="text-content-muted">
                  {t('contractsSearch.tooltip.more')}
                </li>
              )}
            </ul>
          </div>
          {contract.topItems.length > 1 && (
            <div className="mt-2 text-content-muted">
              {t('contractsSearch.tooltip.multipleItemsHint')}
            </div>
          )}
        </div>
      </div>
    )
  }
)
