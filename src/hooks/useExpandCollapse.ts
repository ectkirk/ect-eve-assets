import { useState, useCallback, useMemo, useEffect } from 'react'

interface ExpandCollapseControl {
  isExpanded: boolean
  toggle: () => void
}

interface UseExpandCollapseResult<T> {
  expandedSet: Set<T>
  isExpanded: (id: T) => boolean
  toggle: (id: T) => void
  expandAll: () => void
  collapseAll: () => void
  isAllExpanded: boolean
}

export function useExpandCollapse<T>(
  items: T[],
  setExpandCollapse?: ((control: ExpandCollapseControl | null) => void) | null,
  initialExpanded?: Set<T>
): UseExpandCollapseResult<T> {
  const [expandedSet, setExpandedSet] = useState<Set<T>>(
    initialExpanded ?? new Set()
  )

  const toggle = useCallback((id: T) => {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedSet(new Set(items))
  }, [items])

  const collapseAll = useCallback(() => {
    setExpandedSet(new Set())
  }, [])

  const isExpanded = useCallback((id: T) => expandedSet.has(id), [expandedSet])

  const isAllExpanded = useMemo(
    () => items.length > 0 && items.every((id) => expandedSet.has(id)),
    [items, expandedSet]
  )

  useEffect(() => {
    if (!setExpandCollapse) return

    if (items.length === 0) {
      setExpandCollapse(null)
      return
    }

    setExpandCollapse({
      isExpanded: isAllExpanded,
      toggle: () => {
        if (isAllExpanded) collapseAll()
        else expandAll()
      },
    })

    return () => setExpandCollapse(null)
  }, [items.length, isAllExpanded, expandAll, collapseAll, setExpandCollapse])

  return {
    expandedSet,
    isExpanded,
    toggle,
    expandAll,
    collapseAll,
    isAllExpanded,
  }
}
