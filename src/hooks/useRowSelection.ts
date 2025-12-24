import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'

export interface CopyData {
  name: string
  quantity: number
  isItem: boolean
  fullRowData?: string
}

interface UseRowSelectionOptions<T> {
  items: T[]
  getId: (item: T) => string
  getCopyData: (item: T) => CopyData
  containerRef: React.RefObject<HTMLElement | null>
}

export function useRowSelection<T>({
  items,
  getId,
  getCopyData,
  containerRef,
}: UseRowSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)
  const itemsRef = useRef(items)

  useLayoutEffect(() => {
    itemsRef.current = items
  }, [items])

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  )

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    lastClickedRef.current = null
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(itemsRef.current.map(getId)))
  }, [getId])

  const handleRowClick = useCallback(
    (id: string, event: React.MouseEvent) => {
      if (event.shiftKey) {
        event.preventDefault()
      }

      const items = itemsRef.current
      const ids = items.map(getId)

      if (event.shiftKey && lastClickedRef.current) {
        const lastIndex = ids.indexOf(lastClickedRef.current)
        const currentIndex = ids.indexOf(id)
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex)
          const end = Math.max(lastIndex, currentIndex)
          const rangeIds = ids.slice(start, end + 1)
          if (event.ctrlKey || event.metaKey) {
            setSelectedIds((prev) => new Set([...prev, ...rangeIds]))
          } else {
            setSelectedIds(new Set(rangeIds))
          }
          return
        }
      }

      if (event.ctrlKey || event.metaKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) {
            next.delete(id)
          } else {
            next.add(id)
          }
          return next
        })
      } else {
        setSelectedIds(new Set([id]))
      }
      lastClickedRef.current = id
    },
    [getId]
  )

  const copySelected = useCallback(() => {
    if (selectedIds.size === 0) return

    const items = itemsRef.current
    const selectedItems = items.filter((item) => selectedIds.has(getId(item)))

    if (selectedItems.length === 1 && selectedItems[0]) {
      const data = getCopyData(selectedItems[0])
      if (!data.isItem && data.fullRowData) {
        navigator.clipboard.writeText(data.fullRowData)
      } else {
        navigator.clipboard.writeText(`${data.name}\t${data.quantity}`)
      }
      return
    }

    const lines: string[] = []
    for (const item of selectedItems) {
      const data = getCopyData(item)
      if (data.isItem) {
        lines.push(`${data.name}\t${data.quantity}`)
      }
    }

    if (lines.length > 0) {
      navigator.clipboard.writeText(lines.join('\n'))
    }
  }, [selectedIds, getId, getCopyData])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        selectAll()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedIds.size > 0) {
          e.preventDefault()
          copySelected()
        }
      } else if (e.key === 'Escape') {
        clearSelection()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [containerRef, selectAll, copySelected, clearSelection, selectedIds.size])

  return {
    selectedIds,
    isSelected,
    handleRowClick,
    clearSelection,
    selectAll,
    copySelected,
    selectedCount: selectedIds.size,
  }
}
