import { useState, useCallback } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'

export type SortDirection = 'asc' | 'desc'

export interface SortState<T extends string> {
  column: T
  direction: SortDirection
}

export function useSortable<T extends string>(
  defaultColumn: T,
  defaultDirection: SortDirection = 'desc'
) {
  const [sortColumn, setSortColumn] = useState<T>(defaultColumn)
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(defaultDirection)

  const handleSort = useCallback(
    (column: T) => {
      if (sortColumn === column) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortColumn(column)
        setSortDirection('desc')
      }
    },
    [sortColumn]
  )

  return {
    sortColumn,
    sortDirection,
    handleSort,
    setSortColumn,
    setSortDirection,
  }
}

export function SortableHeader<T extends string>({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  className = '',
}: {
  column: T
  label: string
  sortColumn: T
  sortDirection: SortDirection
  onSort: (column: T) => void
  className?: string
}) {
  const isActive = sortColumn === column
  const isRightAligned = className.includes('text-right')

  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-surface-tertiary/50 ${className}`}
      onClick={() => onSort(column)}
    >
      <div
        className={`flex items-center gap-1 ${isRightAligned ? 'justify-end' : ''}`}
      >
        {label}
        {isActive &&
          (sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          ))}
      </div>
    </TableHead>
  )
}

export function sortRows<T, C extends string>(
  rows: T[],
  sortColumn: C,
  sortDirection: SortDirection,
  getValue: (row: T, column: C) => number | string | null
): T[] {
  return [...rows].sort((a, b) => {
    const aVal = getValue(a, sortColumn)
    const bVal = getValue(b, sortColumn)

    if (aVal === null && bVal === null) return 0
    if (aVal === null) return sortDirection === 'asc' ? 1 : -1
    if (bVal === null) return sortDirection === 'asc' ? -1 : 1

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
}
