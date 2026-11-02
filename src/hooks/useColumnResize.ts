import { useCallback, useMemo, useRef } from 'react'
import { getRecordValue, setRecordValue } from '@/lib/record-utils'
import { useColumnWidths, type ColumnWidths } from './useColumnWidths'

const DEFAULT_COLUMN_WIDTH = 120

interface ColumnResizeOptions {
  getHeaders: () => readonly HTMLElement[]
  applyWidths: (widths: ColumnWidths) => void
  pinAllOnFirstResize: boolean
}

export interface ColumnResize {
  widths: ColumnWidths
  hasCustomWidths: boolean
  startResize: (columnId: string) => number
  resize: (columnId: string, width: number) => void
  endResize: () => void
  reset: () => void
}

export function columnIdOf(el: HTMLElement): string | undefined {
  return el.dataset['columnId']
}

export function useColumnResize(
  storageKey: string,
  { getHeaders, applyWidths, pinAllOnFirstResize }: ColumnResizeOptions,
): ColumnResize {
  const { widths, setWidths, resetWidths } = useColumnWidths(storageKey)
  const pendingRef = useRef<ColumnWidths>(widths)
  const hasCustomWidths = Object.keys(widths).length > 0

  const startResize = useCallback(
    (columnId: string) => {
      const measured = new Map(
        getHeaders().map((el) => [
          columnIdOf(el),
          Math.round(el.getBoundingClientRect().width),
        ]),
      )

      let next = widths
      if (pinAllOnFirstResize && !hasCustomWidths) {
        for (const [id, width] of measured) {
          if (id && width > 0) next = setRecordValue(next, id, width)
        }
        setWidths(next)
      }
      pendingRef.current = next

      const measuredWidth = measured.get(columnId) ?? 0
      return (
        getRecordValue(next, columnId) ??
        (measuredWidth > 0 ? measuredWidth : DEFAULT_COLUMN_WIDTH)
      )
    },
    [getHeaders, widths, pinAllOnFirstResize, hasCustomWidths, setWidths],
  )

  const resize = useCallback(
    (columnId: string, width: number) => {
      pendingRef.current = setRecordValue(pendingRef.current, columnId, width)
      applyWidths(pendingRef.current)
    },
    [applyWidths],
  )

  const endResize = useCallback(() => {
    setWidths(pendingRef.current)
  }, [setWidths])

  return useMemo(
    () => ({
      widths,
      hasCustomWidths,
      startResize,
      resize,
      endResize,
      reset: resetWidths,
    }),
    [widths, hasCustomWidths, startResize, resize, endResize, resetWidths],
  )
}

export { DEFAULT_COLUMN_WIDTH }
