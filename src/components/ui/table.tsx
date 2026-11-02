import * as React from 'react'
import { cn } from '@/lib/utils'
import { getRecordValue, setRecordValue } from '@/lib/record-utils'
import { useColumnWidths, type ColumnWidths } from '@/hooks/useColumnWidths'
import { ColumnResizeHandle } from './column-resize-handle'

const DEFAULT_COLUMN_WIDTH = 120
const FIXED_LAYOUT_CLASS =
  '[&_td]:overflow-hidden [&_th]:overflow-hidden [&_th]:text-ellipsis'

interface ColumnResizeContextValue {
  widths: ColumnWidths
  startResize: (columnId: string) => number
  resize: (columnId: string, width: number) => void
  endResize: () => void
  reset: () => void
}

const ColumnResizeContext =
  React.createContext<ColumnResizeContextValue | null>(null)

function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  return Array.from(
    table.querySelectorAll<HTMLTableCellElement>(
      ':scope > thead > tr:first-child > th[data-column-id]',
    ),
  )
}

function findHeaderCell(
  table: HTMLTableElement,
  columnId: string,
): HTMLTableCellElement | undefined {
  return headerCells(table).find((th) => th.dataset['columnId'] === columnId)
}

function applyFixedLayout(table: HTMLTableElement): void {
  table.style.tableLayout = 'fixed'
  table.style.width = '0'
  table.classList.add(...FIXED_LAYOUT_CLASS.split(' '))
}

function useColumnResize(
  resizeKey: string,
  tableRef: React.RefObject<HTMLTableElement | null>,
): ColumnResizeContextValue {
  const { widths, setWidths, resetWidths } = useColumnWidths(resizeKey)
  const pendingRef = React.useRef<ColumnWidths>(widths)

  const startResize = React.useCallback(
    (columnId: string) => {
      const table = tableRef.current
      if (!table) return DEFAULT_COLUMN_WIDTH

      let next = widths
      if (Object.keys(widths).length === 0) {
        for (const th of headerCells(table)) {
          const id = th.dataset['columnId']
          if (!id) continue
          const measured = Math.round(th.getBoundingClientRect().width)
          if (measured <= 0) continue
          th.style.width = `${measured}px`
          next = setRecordValue(next, id, measured)
        }
        applyFixedLayout(table)
      }
      pendingRef.current = next

      return getRecordValue(next, columnId) ?? DEFAULT_COLUMN_WIDTH
    },
    [tableRef, widths],
  )

  const resize = React.useCallback(
    (columnId: string, width: number) => {
      const th = tableRef.current
        ? findHeaderCell(tableRef.current, columnId)
        : undefined
      if (th) th.style.width = `${width}px`
      pendingRef.current = setRecordValue(pendingRef.current, columnId, width)
    },
    [tableRef],
  )

  const endResize = React.useCallback(() => {
    setWidths(pendingRef.current)
  }, [setWidths])

  return React.useMemo(
    () => ({ widths, startResize, resize, endResize, reset: resetWidths }),
    [widths, startResize, resize, endResize, resetWidths],
  )
}

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  resizeKey?: string | undefined
  containerClassName?: string | undefined
  containerRef?: React.Ref<HTMLDivElement> | undefined
}

const PlainTable = React.forwardRef<HTMLTableElement, TableProps>(
  (
    {
      className,
      resizeKey: _resizeKey,
      containerClassName,
      containerRef,
      ...props
    },
    ref,
  ) => (
    <div
      ref={containerRef}
      className={cn('relative w-full', containerClassName)}
    >
      <table
        ref={ref}
        className={cn(
          'w-full caption-bottom text-sm [&_td.tabular-nums]:whitespace-nowrap',
          className,
        )}
        {...props}
      />
    </div>
  ),
)
PlainTable.displayName = 'PlainTable'

const ResizableTable = React.forwardRef<
  HTMLTableElement,
  TableProps & { resizeKey: string }
>(
  (
    { className, resizeKey, style, containerClassName, containerRef, ...props },
    ref,
  ) => {
    const tableRef = React.useRef<HTMLTableElement | null>(null)
    const resizeContext = useColumnResize(resizeKey, tableRef)
    const isFixed = Object.keys(resizeContext.widths).length > 0

    const setRefs = React.useCallback(
      (node: HTMLTableElement | null) => {
        tableRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )

    return (
      <ColumnResizeContext.Provider value={resizeContext}>
        <div
          ref={containerRef}
          className={cn('relative w-full', containerClassName)}
        >
          <table
            ref={setRefs}
            className={cn(
              'w-full caption-bottom text-sm [&_td.tabular-nums]:whitespace-nowrap',
              className,
              isFixed && FIXED_LAYOUT_CLASS,
            )}
            style={
              isFixed ? { ...style, tableLayout: 'fixed', width: 0 } : style
            }
            {...props}
          />
        </div>
      </ColumnResizeContext.Provider>
    )
  },
)
ResizableTable.displayName = 'ResizableTable'

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ resizeKey, ...props }, ref) =>
    resizeKey ? (
      <ResizableTable ref={ref} resizeKey={resizeKey} {...props} />
    ) : (
      <PlainTable ref={ref} {...props} />
    ),
)
Table.displayName = 'Table'

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
    const resizeContext = React.useContext(ColumnResizeContext)
    const resizable = resizeContext !== null && columnId !== undefined
    const isFixed =
      resizeContext !== null && Object.keys(resizeContext.widths).length > 0
    const width =
      resizable && isFixed
        ? (getRecordValue(resizeContext.widths, columnId) ??
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
            onResizeStart={() => resizeContext.startResize(columnId)}
            onResize={(w) => {
              resizeContext.resize(columnId, w)
            }}
            onResizeEnd={resizeContext.endResize}
            onReset={resizeContext.reset}
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
}
