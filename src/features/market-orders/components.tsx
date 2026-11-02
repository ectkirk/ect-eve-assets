import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SortableHeader } from '@/components/ui/sortable-header'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn, formatDecimal, formatPrice } from '@/lib/utils'
import { formatExpiry as formatExpiryInfo, MS_PER_DAY } from '@/lib/timer-utils'
import type { SortColumn, DiffSortMode } from './types'

export function formatExpiry(issued: string, duration: number): string {
  const expiryDate = new Date(
    new Date(issued).getTime() + duration * MS_PER_DAY,
  )
  return formatExpiryInfo(expiryDate.toISOString()).text
}

export { formatPrice }

export function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-0.5 rounded hover:bg-surface-secondary/50 text-content-muted hover:text-content-secondary transition-colors"
      title={t('buttons.copyName')}
    >
      {copied ? (
        <Check className="h-3 w-3 text-status-positive" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  )
}

export function DiffCell({
  price,
  comparisonPrice,
  isBuyOrder,
}: {
  price: number
  comparisonPrice: number | null
  isBuyOrder: boolean
}) {
  if (comparisonPrice === null)
    return <span className="text-content-muted">-</span>
  const diff = price - comparisonPrice
  if (diff === 0) {
    return <span>0</span>
  }
  const isGood = isBuyOrder ? diff > 0 : diff < 0
  const formattedDiff = formatPrice(Math.abs(diff))
  const pct = comparisonPrice > 0 ? Math.abs((diff / comparisonPrice) * 100) : 0
  const pctStr = formatDecimal(pct, 1).replace(/[,.]0$/, '')
  return (
    <span>
      {diff < 0 ? '-' : '+'}
      {formattedDiff}{' '}
      <span
        className={`text-xs ${isGood ? 'text-status-positive' : 'text-status-negative'}`}
      >
        ({pctStr}%)
      </span>
    </span>
  )
}

export function EVEEstCell({
  price,
  eveEstimated,
}: {
  price: number
  eveEstimated: number | null
}) {
  if (eveEstimated === null)
    return <span className="text-content-muted">-</span>
  const isAbove = price > eveEstimated
  return (
    <span className={isAbove ? 'text-status-positive' : 'text-status-negative'}>
      {formatPrice(eveEstimated)}
    </span>
  )
}

export function DiffHeader({
  sortColumn,
  sortDirection,
  onSort,
  diffSortMode,
  onDiffSortModeChange,
}: {
  sortColumn: SortColumn
  sortDirection: 'asc' | 'desc'
  onSort: (column: SortColumn) => void
  diffSortMode: DiffSortMode
  onDiffSortModeChange: (mode: DiffSortMode) => void
}) {
  const { t } = useTranslation('common')
  const label =
    diffSortMode === 'percent' ? `${t('columns.diff')} (%)` : t('columns.diff')

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SortableHeader
          column="diff"
          label={label}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={onSort}
          className="text-right"
        />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          className={cn(diffSortMode === 'number' && 'text-accent')}
          onClick={() => {
            onDiffSortModeChange('number')
          }}
        >
          {t('marketOrders.sortByIsk')}
        </ContextMenuItem>
        <ContextMenuItem
          className={cn(diffSortMode === 'percent' && 'text-accent')}
          onClick={() => {
            onDiffSortModeChange('percent')
          }}
        >
          {t('marketOrders.sortByPercent')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
