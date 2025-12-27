import { forwardRef } from 'react'
import {
  getSecurityColor,
  formatBlueprintName,
  decodeHtmlEntities,
  getContractTypeLabel,
} from './utils'
import type { SearchContract } from './types'

interface ContractTooltipProps {
  contract: SearchContract
  position: { x: number; y: number } | null
  visible: boolean
}

export const ContractTooltip = forwardRef<HTMLDivElement, ContractTooltipProps>(
  function ContractTooltip({ contract, position, visible }, ref) {
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
            ? '[Multiple Items]'
            : contract.topItems[0]
              ? formatBlueprintName(contract.topItems[0])
              : '-'}
        </div>
        <div className="space-y-1 text-sm">
          <div>
            <span className="text-content-muted">Contract Type: </span>
            <span className="text-content">
              {getContractTypeLabel(contract.type)}
            </span>
          </div>
          <div>
            <span className="text-content-muted">Location: </span>
            <span className="text-content">
              {contract.systemName}
              {contract.securityStatus != null && (
                <span
                  className={`ml-1 ${getSecurityColor(contract.securityStatus)}`}
                >
                  ({contract.securityStatus.toFixed(1)})
                </span>
              )}
            </span>
          </div>
          <div>
            <span className="text-content-muted">Issuer: </span>
            <span className="text-content">{contract.issuerName}</span>
          </div>
          {contract.title && (
            <div>
              <span className="text-content-muted">
                Description By Issuer:{' '}
              </span>
              <span className="text-content">
                {decodeHtmlEntities(contract.title)}
              </span>
            </div>
          )}
          <div className="mt-2">
            <span className="text-content-muted">Items:</span>
            <ul className="ml-2 mt-1 space-y-0.5">
              {contract.topItems.map((item, idx) => (
                <li key={item.typeId ?? idx} className="text-content">
                  {item.quantity.toLocaleString()} x {formatBlueprintName(item)}
                </li>
              ))}
              {contract.itemCount > contract.topItems.length && (
                <li className="text-content-muted">More...</li>
              )}
            </ul>
          </div>
          {contract.topItems.length > 1 && (
            <div className="mt-2 text-content-muted">
              Contract contains multiple items. Open it to view them.
            </div>
          )}
        </div>
      </div>
    )
  }
)
