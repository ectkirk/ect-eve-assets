import { useState, useCallback } from 'react'
import type { TreeNode } from '@/lib/tree-types'
import { getAllNodeIds } from '@/lib/tree'

export function useTreeState(nodes: TreeNode[]) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allIds = getAllNodeIds(nodes)
    setExpandedNodes(new Set(allIds))
  }, [nodes])

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  return {
    expandedNodes,
    toggleExpand,
    expandAll,
    collapseAll,
  }
}
