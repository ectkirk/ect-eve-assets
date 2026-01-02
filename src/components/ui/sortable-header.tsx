import { ChevronUp, ChevronDown } from 'lucide-react'
import { TableHead } from './table'
import type { SortDirection } from '@/hooks'

export type { SortDirection }

interface SortableHeaderProps<T extends string> {
  column: T
  label: string
  sortColumn: T | null
  sortDirection: SortDirection
  onSort: (column: T) => void
  className?: string
}

export function SortableHeader<T extends string>({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  className,
}: SortableHeaderProps<T>) {
  const isActive = sortColumn === column
  const isCentered = className?.includes('text-center')

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`flex w-full items-center gap-1 cursor-pointer select-none rounded px-2 py-1 -mx-2 -my-1 hover:bg-surface-tertiary focus:outline-none focus:ring-2 focus:ring-content-secondary ${isCentered ? 'justify-center' : ''}`}
        aria-sort={
          isActive
            ? sortDirection === 'asc'
              ? 'ascending'
              : 'descending'
            : undefined
        }
      >
        {label}
        {isActive &&
          (sortDirection === 'asc' ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ))}
      </button>
    </TableHead>
  )
}
