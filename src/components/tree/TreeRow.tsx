import { memo, useCallback } from 'react'
import { TableRow } from '@/components/ui/table'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { isAbyssalTypeId, getMutamarketUrl } from '@/api/mutamarket-client'
import { hasAbyssal } from '@/store/reference-cache'
import { cn } from '@/lib/utils'
import type { TreeNode } from '@/lib/tree-types'
import { TreeRowContent } from './TreeRowContent'

interface TreeRowProps {
  node: TreeNode
  virtualIndex: number
  isExpanded: boolean
  onToggleExpand: (nodeId: string) => void
  onViewFitting: (node: TreeNode) => void
  visibleColumns: string[]
}

export const TreeRow = memo(function TreeRow({
  node,
  virtualIndex,
  isExpanded,
  onToggleExpand,
  onViewFitting,
  visibleColumns,
}: TreeRowProps) {
  const handleRowClick = useCallback(() => {
    if (node.children.length > 0) {
      onToggleExpand(node.id)
    }
  }, [node.children.length, node.id, onToggleExpand])

  const handleViewFittingClick = useCallback(() => {
    onViewFitting(node)
  }, [node, onViewFitting])

  const handleOpenMutamarket = useCallback(() => {
    if (node.asset?.item_id && node.typeName) {
      window.open(getMutamarketUrl(node.typeName, node.asset.item_id), '_blank')
    }
  }, [node.asset, node.typeName])

  const isShip = node.nodeType === 'ship'
  const isAbyssalResolved =
    node.typeId &&
    node.asset?.item_id &&
    isAbyssalTypeId(node.typeId) &&
    hasAbyssal(node.asset.item_id)

  const row = (
    <TableRow
      key={node.id}
      data-index={virtualIndex}
      className={cn(
        node.nodeType === 'region' && 'bg-surface-secondary/30',
        node.nodeType === 'system' && 'bg-surface-secondary/20',
        node.isActiveShip && 'bg-row-active-ship',
        node.isInContract && 'bg-row-contract',
        node.isInMarketOrder && 'bg-row-order',
        node.isInIndustryJob && 'bg-row-industry',
        node.isOwnedStructure && 'bg-row-structure'
      )}
      onClick={handleRowClick}
    >
      <TreeRowContent
        node={node}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        visibleColumns={visibleColumns}
      />
    </TableRow>
  )

  if (isShip || isAbyssalResolved) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          {isShip && (
            <ContextMenuItem onClick={handleViewFittingClick}>
              View Fitting
            </ContextMenuItem>
          )}
          {isAbyssalResolved && (
            <ContextMenuItem onClick={handleOpenMutamarket}>
              Open in Mutamarket
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return row
})
