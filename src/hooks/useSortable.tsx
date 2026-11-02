import { useState, useCallback } from 'react'

export type SortDirection = 'asc' | 'desc'

export interface SortState<T extends string> {
  column: T
  direction: SortDirection
}

export function useSortable<T extends string>(
  defaultColumn: T,
  defaultDirection: SortDirection = 'desc',
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
    [sortColumn],
  )

  return {
    sortColumn,
    sortDirection,
    handleSort,
  }
}

export function sortRows<T, C extends string>(
  rows: T[],
  sortColumn: C,
  sortDirection: SortDirection,
  getValue: (row: T, column: C) => number | string | null,
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
