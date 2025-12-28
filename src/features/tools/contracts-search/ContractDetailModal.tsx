import { useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TypeIcon } from '@/components/ui/type-icon'
import { AbyssalPreview } from '@/components/ui/abyssal-preview'
import { isAbyssalTypeId } from '@/api/mutamarket-client'
import { cn, formatNumber } from '@/lib/utils'
import { CopyButton } from '@/components/ui/copy-button'
import { useContractItems } from './useContractItems'
import { useContractBids } from './useContractBids'
import {
  getSecurityColor,
  formatBlueprintName,
  formatDateTime,
  formatTimeRemaining,
  getContractTypeLabel,
} from './utils'
import type { ContractItem } from '@/lib/contract-items'

const BLUEPRINT_CATEGORY_ID = 9

export interface DisplayContract {
  contractId: number
  type: 'item_exchange' | 'auction' | 'courier' | 'unknown' | 'loan'
  title?: string
  assigneeName?: string
  locationName: string
  endLocationName?: string
  regionName?: string
  systemName?: string
  systemId?: number
  securityStatus?: number | null
  dateIssued: string
  dateExpired: string
  price: number
  buyout?: number | null
  reward?: number
  collateral?: number
  volume?: number
  status?: string
  availability?: 'public' | 'personal' | 'corporation' | 'alliance'
  topItemName?: string
  isWantToBuy?: boolean
}

function InfoRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-4 py-0.5">
      <span className="w-32 shrink-0 text-content-secondary">{label}</span>
      <span className="text-content">{children}</span>
    </div>
  )
}

function ItemsTable({ items }: { items: ContractItem[] }) {
  const totalValue = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  return (
    <div className="flex flex-col">
      <div className="max-h-80 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead className="w-20 text-right">Qty</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Est. Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => {
              const isAbyssal = item.itemId && isAbyssalTypeId(item.typeId)
              const isBlueprint = item.categoryId === BLUEPRINT_CATEGORY_ID
              const displayName = formatBlueprintName(item)
              const nameContent = (
                <span
                  className={cn(
                    'font-medium',
                    isBlueprint && 'text-status-special'
                  )}
                >
                  {displayName}
                </span>
              )
              return (
                <TableRow key={`${item.typeId}-${idx}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <TypeIcon
                        typeId={item.typeId}
                        categoryId={item.categoryId}
                        isBlueprintCopy={item.isBlueprintCopy}
                        size="sm"
                      />
                      {isAbyssal ? (
                        <AbyssalPreview itemId={item.itemId!}>
                          {nameContent}
                        </AbyssalPreview>
                      ) : (
                        nameContent
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-content-secondary">
                    {item.groupName}
                  </TableCell>
                  <TableCell className="text-content-secondary">
                    {item.categoryName}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {item.price
                      ? formatNumber(item.price * item.quantity)
                      : '-'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {totalValue > 0 && (
        <div className="flex justify-end border-t border-border px-4 py-2 text-sm">
          <span className="text-content-secondary">Est. Value:</span>
          <span className="ml-2 font-mono text-content">
            {formatNumber(totalValue)} ISK
          </span>
        </div>
      )}
    </div>
  )
}

interface ContractDetailModalProps {
  contract: DisplayContract
  preloadedItems?: ContractItem[]
  onClose: () => void
}

export function ContractDetailModal({
  contract,
  preloadedItems,
  onClose,
}: ContractDetailModalProps) {
  const { items: fetchedItems, loading, error, fetchItems } = useContractItems()
  const { bids, loading: bidsLoading, fetchBids } = useContractBids()
  const items = preloadedItems ?? fetchedItems
  const isLoading = preloadedItems ? false : loading || fetchedItems === null
  const currentBid = bids?.[0]?.amount ?? null

  useEffect(() => {
    if (!preloadedItems) {
      fetchItems(contract.contractId)
    }
    if (contract.type === 'auction') {
      fetchBids(contract.contractId)
    }
  }, [
    contract.contractId,
    contract.type,
    fetchItems,
    fetchBids,
    preloadedItems,
  ])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const title = contract.topItemName ?? '[Multiple Items]'
  const availabilityText =
    contract.availability === 'public'
      ? `Public${contract.regionName ? ` - Region: ${contract.regionName}` : ''}`
      : (contract.assigneeName ?? 'Private')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-medium text-content">{title}</h2>
              <span className="text-sm text-content-secondary">
                ({getContractTypeLabel(contract.type)})
              </span>
            </div>
            {contract.systemId && (
              <CopyButton
                text={`<url=contract:${contract.systemId}//${contract.contractId}>${title}</url>`}
                label=""
                className="border-0 bg-transparent px-1 py-0.5 hover:bg-surface-tertiary"
              />
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-content-muted hover:bg-surface-tertiary hover:text-content"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="border-b border-border px-4 py-3 text-sm">
            {contract.title && (
              <InfoRow label="Info by Issuer">{contract.title}</InfoRow>
            )}
            <InfoRow label="Type">
              {getContractTypeLabel(contract.type)}
            </InfoRow>
            <InfoRow label="Availability">{availabilityText}</InfoRow>
            <InfoRow label="Location">
              {contract.securityStatus != null && (
                <span className={getSecurityColor(contract.securityStatus)}>
                  {contract.securityStatus.toFixed(1)}{' '}
                </span>
              )}
              {contract.systemName ?? contract.locationName}
              {contract.endLocationName && (
                <span className="text-content-muted">
                  {' '}
                  → {contract.endLocationName}
                </span>
              )}
            </InfoRow>
            <InfoRow label="Date Issued">
              {formatDateTime(contract.dateIssued)}
            </InfoRow>
            <InfoRow label="Expiration">
              {formatDateTime(contract.dateExpired)} (
              {formatTimeRemaining(contract.dateExpired)})
            </InfoRow>
            {contract.status && (
              <InfoRow label="Status">
                <span className="capitalize">
                  {contract.status.replace('_', ' ')}
                </span>
              </InfoRow>
            )}
          </div>

          {contract.type === 'courier' ? (
            <div className="border-b border-border px-4 py-3 text-sm">
              <InfoRow label="Volume">
                {contract.volume?.toLocaleString() ?? '-'} m³
              </InfoRow>
              <InfoRow label="Reward">
                <span className="text-status-positive">
                  {formatNumber(contract.reward ?? 0)} ISK
                </span>
              </InfoRow>
              <InfoRow label="Collateral">
                <span className="text-status-highlight">
                  {formatNumber(contract.collateral ?? 0)} ISK
                </span>
              </InfoRow>
            </div>
          ) : contract.type === 'auction' ? (
            <div className="border-b border-border px-4 py-3 text-sm">
              <InfoRow label="Starting Bid">
                <span className="text-content-muted">
                  {formatNumber(contract.price)} ISK
                </span>
              </InfoRow>
              <InfoRow label="Current Bid">
                {bidsLoading ? (
                  <span className="text-content-muted">Loading...</span>
                ) : currentBid != null ? (
                  <span className="text-status-highlight">
                    {formatNumber(currentBid)} ISK
                  </span>
                ) : (
                  <span className="text-content-muted">No bids</span>
                )}
              </InfoRow>
              {contract.buyout != null && contract.buyout > 0 && (
                <InfoRow label="Buyout">
                  <span className="text-status-positive">
                    {formatNumber(contract.buyout)} ISK
                  </span>
                </InfoRow>
              )}
            </div>
          ) : contract.isWantToBuy ? (
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-baseline gap-4">
                <span className="text-sm font-medium text-content">
                  You Receive
                </span>
                <span className="text-lg font-bold text-status-positive">
                  {formatNumber(contract.reward ?? 0)} ISK
                </span>
              </div>
            </div>
          ) : (
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-baseline gap-4">
                <span className="text-sm font-medium text-content">Price</span>
                <span className="text-lg font-bold text-status-highlight">
                  {formatNumber(contract.price)} ISK
                </span>
              </div>
            </div>
          )}

          {contract.type !== 'courier' && (
            <div className="px-4 py-3">
              {isLoading ? (
                <div className="flex items-center gap-2 py-8 text-content-muted">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading items...
                </div>
              ) : error ? (
                <div className="py-4 text-red-400">{error}</div>
              ) : items && items.length > 0 ? (
                (() => {
                  const includedItems = items.filter(
                    (i) => i.isIncluded !== false
                  )
                  const requestedItems = items.filter(
                    (i) => i.isIncluded === false
                  )
                  return (
                    <>
                      {includedItems.length > 0 && (
                        <div
                          className={requestedItems.length > 0 ? 'mb-4' : ''}
                        >
                          <h3 className="mb-2 text-sm font-medium text-status-positive">
                            {requestedItems.length > 0
                              ? 'What You Get'
                              : 'Items'}
                          </h3>
                          <ItemsTable items={includedItems} />
                        </div>
                      )}
                      {requestedItems.length > 0 && (
                        <div>
                          <h3 className="mb-2 text-sm font-medium text-status-negative">
                            What They Want
                          </h3>
                          <ItemsTable items={requestedItems} />
                        </div>
                      )}
                    </>
                  )
                })()
              ) : (
                <div className="py-4 text-content-muted">No items</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
