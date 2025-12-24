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
import { formatNumber } from '@/lib/utils'
import { useContractItems, type ContractItem } from './useContractItems'
import type { SearchContract } from './types'

function getSecurityColor(sec: number): string {
  if (sec >= 0.5) return 'text-status-positive'
  if (sec > 0) return 'text-status-warning'
  return 'text-status-negative'
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTimeRemaining(dateExpired: string): string {
  const now = new Date()
  const expiry = new Date(dateExpired)
  const diff = expiry.getTime() - now.getTime()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return `${days} days ${hours} hours`
}

function getContractTypeLabel(type: string): string {
  switch (type) {
    case 'item_exchange':
      return 'Item Exchange'
    case 'auction':
      return 'Auction'
    case 'courier':
      return 'Courier'
    default:
      return type
  }
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
    (sum, item) => sum + (item.price ?? 0) * item.quantity,
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
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Est. Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow key={`${item.typeId}-${idx}`}>
                <TableCell className="font-medium">{item.typeName}</TableCell>
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
                    ? formatNumber((item.price ?? 0) * item.quantity)
                    : '-'}
                </TableCell>
              </TableRow>
            ))}
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
  contract: SearchContract
  onClose: () => void
}

export function ContractDetailModal({
  contract,
  onClose,
}: ContractDetailModalProps) {
  const { items, loading, error, fetchItems } = useContractItems()

  useEffect(() => {
    fetchItems(contract.contractId)
  }, [contract.contractId, fetchItems])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const title =
    contract.topItems.length > 1
      ? '[Multiple Items]'
      : contract.topItems[0]?.typeName || '[Empty]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-medium text-content">{title}</h2>
            <span className="text-sm text-content-secondary">
              ({getContractTypeLabel(contract.type)})
            </span>
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
            <InfoRow label="Issued By">{contract.issuerName}</InfoRow>
            <InfoRow label="Availability">
              Public - Region: {contract.regionName}
            </InfoRow>
            <InfoRow label="Location">
              {contract.securityStatus != null && (
                <span className={getSecurityColor(contract.securityStatus)}>
                  {contract.securityStatus.toFixed(1)}{' '}
                </span>
              )}
              {contract.systemName}
            </InfoRow>
            <InfoRow label="Date Issued">
              {formatDateTime(contract.dateIssued)}
            </InfoRow>
            <InfoRow label="Expiration">
              {formatDateTime(contract.dateExpired)} (
              {getTimeRemaining(contract.dateExpired)})
            </InfoRow>
          </div>

          <div className="border-b border-border px-4 py-3">
            <div className="flex items-baseline gap-4">
              <span className="text-sm font-medium text-content">
                You Will Pay
              </span>
              <span className="text-lg font-bold text-orange-400">
                {formatNumber(contract.price)} ISK
              </span>
            </div>
          </div>

          <div className="px-4 py-3">
            <h3 className="mb-2 text-sm font-medium text-status-positive">
              You Will Get
            </h3>
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-content-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading items...
              </div>
            ) : error ? (
              <div className="py-4 text-red-400">{error}</div>
            ) : items && items.length > 0 ? (
              <ItemsTable items={items} />
            ) : (
              <div className="py-4 text-content-muted">No items</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
