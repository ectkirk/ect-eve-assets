import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check, ArrowUp, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TableHead } from '@/components/ui/table'
import { formatDecimal, formatPrice } from '@/lib/utils'
import { formatExpiry as formatExpiryInfo, MS_PER_DAY } from '@/lib/timer-utils'
import type { SortColumn, DiffSortMode } from './types'

export function formatExpiry(issued: string, duration: number): string {
  const expiryDate = new Date(
    new Date(issued).getTime() + duration * MS_PER_DAY
  )
  return formatExpiryInfo(expiryDate.toISOString()).text
}

export { formatPrice }

export function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation('common')
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const isActive = sortColumn === 'diff'

  const handleClick = () => onSort('diff')

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }

  useEffect(() => {
    if (menuOpen) {
      const close = () => setMenuOpen(false)
      window.addEventListener('click', close)
      return () => window.removeEventListener('click', close)
    }
  }, [menuOpen])

  return (
    <TableHead
      className="text-right cursor-pointer select-none hover:bg-surface-tertiary/50"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="flex items-center gap-1 justify-end">
        {t('columns.diff')} {diffSortMode === 'percent' ? '(%)' : ''}
        {isActive &&
          (sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </div>
      {menuOpen &&
        createPortal(
          <div
            className="fixed z-50 bg-surface border border-border rounded shadow-lg py-1 text-sm"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              className={`w-full px-3 py-1 text-left hover:bg-surface-secondary ${diffSortMode === 'number' ? 'text-accent' : ''}`}
              onClick={() => {
                onDiffSortModeChange('number')
                setMenuOpen(false)
              }}
            >
              {t('marketOrders.sortByIsk')}
            </button>
            <button
              className={`w-full px-3 py-1 text-left hover:bg-surface-secondary ${diffSortMode === 'percent' ? 'text-accent' : ''}`}
              onClick={() => {
                onDiffSortModeChange('percent')
                setMenuOpen(false)
              }}
            >
              {t('marketOrders.sortByPercent')}
            </button>
          </div>,
          document.body
        )}
    </TableHead>
  )
}
