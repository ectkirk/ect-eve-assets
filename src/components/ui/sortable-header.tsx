import { ArrowDown, ArrowUp } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
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
          <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        ))}
    </button>
  )
}

type SortableHeaderProps<T extends string> = Omit<
  React.ThHTMLAttributes<HTMLTableCellElement>,
  'children'
> & {
  column: T
  label: string
  sortColumn: T | null
  sortDirection: SortDirection
  onSort: (column: T) => void
  ref?: React.Ref<HTMLTableCellElement>
}

export function SortableHeader<T extends string>({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  className,
  ...thProps
}: SortableHeaderProps<T>) {
  const { t } = useTranslation('common')
  const isActive = sortColumn === column
  const displayLabel = label.includes('.') ? t(label) : label
  const justify = className?.includes('text-right')
    ? 'justify-end'
    : className?.includes('text-center')
      ? 'justify-center'
      : ''
  const ariaSort = isActive
    ? sortDirection === 'asc'
      ? 'ascending'
      : 'descending'
    : undefined

  return (
    <TableHead
      {...thProps}
      columnId={column}
      aria-sort={ariaSort}
      className={cn('p-0', className)}
    >
      <button
        type="button"
        onClick={() => {
          onSort(column)
        }}
        className={cn(
          'flex h-10 w-full cursor-pointer select-none items-center gap-1 px-2 hover:bg-surface-tertiary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
          justify,
        )}
      >
        {displayLabel}
        {isActive &&
          (sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
          ))}
      </button>
    </TableHead>
  )
}
