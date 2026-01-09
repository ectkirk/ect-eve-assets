import { ChevronUp, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TableHead } from './table'
import type { SortDirection } from '@/hooks'

export type { SortDirection }

interface SortButtonProps {
  label: string
  isActive: boolean
  sortDirection: SortDirection
  onClick: () => void
  align?: 'left' | 'center' | 'right'
}

export function SortButton({
  label,
  isActive,
  sortDirection,
  onClick,
  align = 'left',
}: SortButtonProps) {
  const { t } = useTranslation('common')
  const displayLabel = label.includes('.') ? t(label) : label
  const justify =
    align === 'center' ? 'justify-center' : align === 'right' ? 'ml-auto' : ''

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 cursor-pointer select-none hover:text-content ${justify}`}
      aria-sort={
        isActive
          ? sortDirection === 'asc'
            ? 'ascending'
            : 'descending'
          : undefined
      }
    >
      {displayLabel}
      {isActive &&
        (sortDirection === 'asc' ? (
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        ))}
    </button>
  )
}

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
  const { t } = useTranslation('common')
  const isActive = sortColumn === column
  const isCentered = className?.includes('text-center')
  const displayLabel = label.includes('.') ? t(label) : label

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
        {displayLabel}
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
