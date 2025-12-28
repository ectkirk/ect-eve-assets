import { useState, useCallback } from 'react'
import type { SortDirection } from '@/components/ui/sortable-header'

export function useSortToggle<T extends string>(
  getDefaultDirection?: (column: T) => SortDirection
) {
  const [sortColumn, setSortColumn] = useState<T | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = useCallback(
    (column: T) => {
      if (sortColumn === column) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortColumn(column)
        setSortDirection(getDefaultDirection?.(column) ?? 'asc')
      }
    },
    [sortColumn, getDefaultDirection]
  )

  return { sortColumn, sortDirection, handleSort }
}
