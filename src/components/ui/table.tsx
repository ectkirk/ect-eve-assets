import * as React from 'react'
import { cn } from '@/lib/utils'
import { getRecordValue } from '@/lib/record-utils'
import type { ColumnWidths } from '@/hooks/useColumnWidths'
import {
  useColumnResize,
  columnIdOf,
  DEFAULT_COLUMN_WIDTH,
  type ColumnResize,
} from '@/hooks/useColumnResize'
import { ColumnResizeHandle } from './column-resize-handle'

const BASE_TABLE_CLASS =
  'w-full caption-bottom text-sm [&_td.tabular-nums]:whitespace-nowrap'
const FIXED_LAYOUT_CLASS =
  '[&_td]:overflow-hidden [&_td_*]:max-w-none [&_th]:overflow-hidden [&_th]:text-ellipsis'

const ColumnResizeContext = React.createContext<ColumnResize | null>(null)

function headerCells(table: HTMLTableElement | null): HTMLTableCellElement[] {
  if (!table) return []
  return Array.from(
    table.querySelectorAll<HTMLTableCellElement>(
      ':scope > thead > tr:first-child > th[data-column-id]',
    ),
  )
}

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  resizeKey?: string | undefined
}

const BaseTable = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table ref={ref} className={cn(BASE_TABLE_CLASS, className)} {...props} />
))
BaseTable.displayName = 'BaseTable'

const ResizableTable = React.forwardRef<
  HTMLTableElement,
  TableProps & { resizeKey: string }
>(({ className, resizeKey, style, ...props }, ref) => {
  const tableRef = React.useRef<HTMLTableElement | null>(null)
  const getHeaders = React.useCallback(() => headerCells(tableRef.current), [])
  const applyWidths = React.useCallback((widths: ColumnWidths) => {
    for (const th of headerCells(tableRef.current)) {
      const id = columnIdOf(th)
      const width = id ? getRecordValue(widths, id) : undefined
      if (width !== undefined) th.style.width = `${width}px`
    }
  }, [])
  const columnResize = useColumnResize(resizeKey, {
    getHeaders,
    applyWidths,
    pinAllOnFirstResize: true,
  })
  const isFixed = columnResize.hasCustomWidths

  const setRefs = React.useCallback(
    (node: HTMLTableElement | null) => {
      tableRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  return (
    <ColumnResizeContext.Provider value={columnResize}>
      <BaseTable
        ref={setRefs}
        className={cn(className, isFixed && FIXED_LAYOUT_CLASS)}
        style={isFixed ? { ...style, tableLayout: 'fixed', width: 0 } : style}
        {...props}
      />
    </ColumnResizeContext.Provider>
  )
})
ResizableTable.displayName = 'ResizableTable'

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ resizeKey, ...props }, ref) =>
    resizeKey ? (
      <ResizableTable ref={ref} resizeKey={resizeKey} {...props} />
    ) : (
      <BaseTable ref={ref} {...props} />
    ),
)
Table.displayName = 'Table'

function TableSpacerRow({
  height,
  colSpan,
}: {
  height: number
  colSpan: number
}) {
  if (height <= 0) return null
  return (
    <tr aria-hidden="true">
      <td colSpan={colSpan} style={{ height, padding: 0 }} />
    </tr>
  )
}

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
))
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t bg-surface-secondary/50 font-medium [&>tr]:last:border-b-0',
      className,
    )}
    {...props}
  />
))
TableFooter.displayName = 'TableFooter'

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b border-border transition-colors hover:bg-surface-secondary/50 data-[state=selected]:bg-surface-secondary',
      className,
    )}
    {...props}
  />
))
TableRow.displayName = 'TableRow'

type TableHeadProps = React.ThHTMLAttributes<HTMLTableCellElement> & {
  columnId?: string | undefined
}

const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, scope = 'col', columnId, style, children, ...props }, ref) => {
    const columnResize = React.useContext(ColumnResizeContext)
    const resizable = columnResize !== null && columnId !== undefined
    const width =
      resizable && columnResize.hasCustomWidths
        ? (getRecordValue(columnResize.widths, columnId) ??
          DEFAULT_COLUMN_WIDTH)
        : undefined

    return (
      <th
        ref={ref}
        scope={scope}
        data-column-id={resizable ? columnId : undefined}
        style={width === undefined ? style : { ...style, width }}
        className={cn(
          'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-content-secondary [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
          resizable && 'relative',
          className,
        )}
        {...props}
      >
        {children}
        {resizable && (
          <ColumnResizeHandle
            onResizeStart={() => columnResize.startResize(columnId)}
            onResize={(w) => {
              columnResize.resize(columnId, w)
            }}
            onResizeEnd={columnResize.endResize}
            onReset={columnResize.reset}
          />
        )}
      </th>
    )
  },
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
      className,
    )}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-content-secondary', className)}
    {...props}
  />
))
TableCaption.displayName = 'TableCaption'

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableSpacerRow,
}
