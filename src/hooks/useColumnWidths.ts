import { useCallback, useState } from 'react'
import { logger } from '@/lib/logger'
import { parsePositiveNumberRecord } from '@/lib/persisted-json'

export type ColumnWidths = Readonly<Record<string, number>>

const STORAGE_PREFIX = 'column-widths:'

function loadWidths(storageKey: string): ColumnWidths {
  try {
    return parsePositiveNumberRecord(
      localStorage.getItem(STORAGE_PREFIX + storageKey),
    )
  } catch (e) {
    logger.warn(`Failed to load column widths for ${storageKey}`, {
      module: 'ColumnWidths',
      error: e instanceof Error ? e.message : String(e),
    })
    return {}
  }
}

function saveWidths(storageKey: string, widths: ColumnWidths): void {
  try {
    if (Object.keys(widths).length === 0) {
      localStorage.removeItem(STORAGE_PREFIX + storageKey)
    } else {
      localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(widths))
    }
  } catch (e) {
    logger.warn(`Failed to save column widths for ${storageKey}`, {
      module: 'ColumnWidths',
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

export function useColumnWidths(storageKey: string) {
  const [widths, setWidthsState] = useState<ColumnWidths>(() =>
    loadWidths(storageKey),
  )

  const setWidths = useCallback(
    (next: ColumnWidths) => {
      setWidthsState(next)
      saveWidths(storageKey, next)
    },
    [storageKey],
  )

  const resetWidths = useCallback(() => {
    setWidths({})
  }, [setWidths])

  return { widths, setWidths, resetWidths }
}
