import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check, ArrowUp, ArrowDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import type { SortColumn, DiffSortMode } from './types'

export function formatExpiry(issued: string, duration: number): string {
  const issuedDate = new Date(issued)
  const expiryDate = new Date(
    issuedDate.getTime() + duration * 24 * 60 * 60 * 1000
  )
  const now = Date.now()
  const remaining = expiryDate.getTime() - now

  if (remaining <= 0) return 'Expired'

  const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
  if (days > 0) return `${days}d`

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  return `${hours}h`
}

export function formatPrice(value: number): string {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return formatted.endsWith('.00') ? formatted.slice(0, -3) : formatted
}

export function CopyButton({ text }: { text: string }) {
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
      title="Copy name"
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
  const pctStr = pct.toFixed(1).replace(/\.0$/, '')
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
        Diff {diffSortMode === 'percent' ? '(%)' : ''}
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
              Sort by ISK
            </button>
            <button
              className={`w-full px-3 py-1 text-left hover:bg-surface-secondary ${diffSortMode === 'percent' ? 'text-accent' : ''}`}
              onClick={() => {
                onDiffSortModeChange('percent')
                setMenuOpen(false)
              }}
            >
              Sort by %
            </button>
          </div>,
          document.body
        )}
    </TableHead>
  )
}
