import { useState, useEffect, useRef, useCallback } from 'react'

export interface ColumnConfig {
  id: string
  label: string
  defaultVisible?: boolean
}

interface ColumnSettings {
  visibility: Record<string, boolean>
  order: string[]
}

function loadSettings(storageKey: string, columns: ColumnConfig[]): ColumnSettings {
  const defaultVisibility: Record<string, boolean> = {}
  const defaultOrder: string[] = []

  for (const col of columns) {
    defaultVisibility[col.id] = col.defaultVisible !== false
    defaultOrder.push(col.id)
  }

  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ColumnSettings>
      return {
        visibility: { ...defaultVisibility, ...parsed.visibility },
        order: parsed.order ?? defaultOrder,
      }
    }
  } catch {
    // Ignore parse errors
  }

  return { visibility: defaultVisibility, order: defaultOrder }
}

function saveSettings(storageKey: string, settings: ColumnSettings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    // Ignore storage errors
  }
}

export function useColumnSettings(storageKey: string, columns: ColumnConfig[]) {
  const [settings, setSettings] = useState<ColumnSettings>(() =>
    loadSettings(storageKey, columns)
  )
  const draggedColumnRef = useRef<string | null>(null)

  useEffect(() => {
    saveSettings(storageKey, settings)
  }, [storageKey, settings])

  const isVisible = useCallback((columnId: string) => {
    return settings.visibility[columnId] !== false
  }, [settings.visibility])

  const toggleVisibility = useCallback((columnId: string) => {
    setSettings(prev => ({
      ...prev,
      visibility: {
        ...prev.visibility,
        [columnId]: !prev.visibility[columnId],
      },
    }))
  }, [])

  const getVisibleColumns = useCallback(() => {
    return settings.order.filter(id => settings.visibility[id] !== false)
  }, [settings])

  const handleDragStart = useCallback((columnId: string) => {
    draggedColumnRef.current = columnId
  }, [])

  const handleDrop = useCallback((targetColumnId: string) => {
    const draggedId = draggedColumnRef.current
    if (!draggedId || draggedId === targetColumnId) return

    setSettings(prev => {
      const newOrder = [...prev.order]
      const draggedIndex = newOrder.indexOf(draggedId)
      const targetIndex = newOrder.indexOf(targetColumnId)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedId)

      return { ...prev, order: newOrder }
    })

    draggedColumnRef.current = null
  }, [])

  const getColumnsForDropdown = useCallback(() => {
    return columns.map(col => ({
      id: col.id,
      label: col.label,
      visible: settings.visibility[col.id] !== false,
      toggle: () => toggleVisibility(col.id),
    }))
  }, [columns, settings.visibility, toggleVisibility])

  return {
    isVisible,
    toggleVisibility,
    getVisibleColumns,
    getColumnsForDropdown,
    handleDragStart,
    handleDrop,
  }
}
