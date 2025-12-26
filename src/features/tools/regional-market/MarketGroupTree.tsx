import { memo, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MarketGroupNode } from './types'
import { flattenTree } from './use-market-groups'

interface MarketGroupTreeProps {
  tree: MarketGroupNode[]
  expandedIds: Set<number>
  selectedGroupId: number | null
  onToggleExpand: (groupId: number) => void
  onSelectGroup: (groupId: number) => void
}

const ROW_HEIGHT = 28

const MarketGroupRow = memo(function MarketGroupRow({
  node,
  isExpanded,
  isSelected,
  onToggleExpand,
  onSelectGroup,
}: {
  node: MarketGroupNode
  isExpanded: boolean
  isSelected: boolean
  onToggleExpand: (groupId: number) => void
  onSelectGroup: (groupId: number) => void
}) {
  const hasChildren = node.children.length > 0
  const indentPx = node.depth * 16

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleExpand(node.group.id)
    },
    [onToggleExpand, node.group.id]
  )

  const handleRowClick = useCallback(() => {
    if (hasChildren) {
      onToggleExpand(node.group.id)
    }
    onSelectGroup(node.group.id)
  }, [hasChildren, onToggleExpand, onSelectGroup, node.group.id])

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 cursor-pointer hover:bg-surface-tertiary',
        isSelected && 'bg-accent/20'
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: `${indentPx + 8}px` }}
      onClick={handleRowClick}
    >
      {hasChildren ? (
        <button
          onClick={handleChevronClick}
          className="p-0.5 hover:bg-surface-secondary rounded flex-shrink-0"
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-content-secondary" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-content-secondary" />
          )}
        </button>
      ) : (
        <span className="w-[22px] flex-shrink-0" />
      )}

      {hasChildren ? (
        isExpanded ? (
          <FolderOpen className="h-4 w-4 text-accent flex-shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-accent flex-shrink-0" />
        )
      ) : (
        <Package className="h-4 w-4 text-content-secondary flex-shrink-0" />
      )}

      <span
        className={cn(
          'text-sm truncate min-w-0',
          isSelected && 'text-accent font-medium'
        )}
        title={node.group.name}
      >
        {node.group.name}
      </span>
    </div>
  )
})

export function MarketGroupTree({
  tree,
  expandedIds,
  selectedGroupId,
  onToggleExpand,
  onSelectGroup,
}: MarketGroupTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const flatRows = flattenTree(tree, expandedIds)

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const node = flatRows[virtualRow.index]!
          return (
            <div
              key={node.group.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MarketGroupRow
                node={node}
                isExpanded={expandedIds.has(node.group.id)}
                isSelected={selectedGroupId === node.group.id}
                onToggleExpand={onToggleExpand}
                onSelectGroup={onSelectGroup}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
