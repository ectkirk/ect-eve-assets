import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/logger'

export interface ColumnConfig {
  id: string
  label: string
  defaultVisible?: boolean
}

export function useColumnSettings(storageKey: string, columns: ColumnConfig[]) {
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {}
    for (const col of columns) {
      defaults[col.id] = col.defaultVisible !== false
    }

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>
        return { ...defaults, ...parsed }
      }
    } catch (e) {
      logger.warn(`Failed to load column settings for ${storageKey}`, {
        module: 'ColumnSettings',
        error: e instanceof Error ? e.message : String(e),
      })
    }

    return defaults
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibility))
    } catch (e) {
      logger.warn(`Failed to save column settings for ${storageKey}`, {
        module: 'ColumnSettings',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }, [storageKey, visibility])

  const toggleVisibility = useCallback((columnId: string) => {
    setVisibility((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }))
  }, [])

  const getVisibleColumns = useCallback(() => {
    return columns
      .filter((col) => visibility[col.id] !== false)
      .map((col) => col.id)
  }, [columns, visibility])

  const getColumnsForDropdown = useCallback(() => {
    return columns.map((col) => ({
      id: col.id,
      label: col.label,
      visible: visibility[col.id] !== false,
      toggle: () => toggleVisibility(col.id),
    }))
  }, [columns, visibility, toggleVisibility])

  return {
    getVisibleColumns,
    getColumnsForDropdown,
  }
}
