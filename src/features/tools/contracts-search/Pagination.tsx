import { useMemo } from 'react'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'

const MAX_VISIBLE_PAGES = 10

function getVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const halfWindow = Math.floor(MAX_VISIBLE_PAGES / 2)
  let start = currentPage - halfWindow
  let end = currentPage + halfWindow

  if (start < 1) {
    start = 1
    end = MAX_VISIBLE_PAGES
  } else if (end > totalPages) {
    end = totalPages
    start = totalPages - MAX_VISIBLE_PAGES + 1
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  isLoading: boolean
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  isLoading,
}: PaginationProps) {
  const visiblePages = useMemo(
    () => getVisiblePages(page, totalPages),
    [page, totalPages]
  )

  if (totalPages <= 1) return null

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-2">
      <span className="text-sm text-content-secondary">
        Showing {startItem.toLocaleString()}-{endItem.toLocaleString()} of{' '}
        {total.toLocaleString()}
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={isLoading || page === 1}
          className="rounded px-1.5 py-1 text-sm hover:bg-surface-tertiary disabled:opacity-50"
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        {visiblePages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            disabled={isLoading || p === page}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            className={`min-w-[32px] rounded px-2 py-1 text-sm ${
              p === page ? 'bg-accent text-white' : 'hover:bg-surface-tertiary'
            } disabled:opacity-50`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={isLoading || page === totalPages}
          className="rounded px-1.5 py-1 text-sm hover:bg-surface-tertiary disabled:opacity-50"
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
