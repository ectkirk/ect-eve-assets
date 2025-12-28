import { memo, useRef, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TypeIcon } from '@/components/ui/type-icon'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import type { MarketGroupNode } from './types'
import { flattenTreeWithItems } from './use-market-groups'

interface MarketGroupTreeProps {
  tree: MarketGroupNode[]
  expandedIds: Set<number>
  selectedGroupId: number | null
  selectedTypeId: number | null
  onToggleExpand: (groupId: number) => void
  onSelectGroup: (groupId: number) => void
  onSelectType: (typeId: number) => void
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
    onToggleExpand(node.group.id)
    onSelectGroup(node.group.id)
  }, [onToggleExpand, onSelectGroup, node.group.id])

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 cursor-pointer hover:bg-surface-tertiary',
        isSelected && 'bg-accent/20'
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: `${indentPx + 8}px` }}
      onClick={handleRowClick}
    >
      <button
        onClick={handleChevronClick}
        className="p-0.5 hover:bg-surface-secondary rounded flex-shrink-0"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.group.name}`}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-content-secondary" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-content-secondary" />
        )}
      </button>

      {hasChildren ? (
        isExpanded ? (
          <FolderOpen className="h-4 w-4 text-accent flex-shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-accent flex-shrink-0" />
        )
      ) : (
        <Folder className="h-4 w-4 text-content-secondary flex-shrink-0" />
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

const ItemRow = memo(function ItemRow({
  type,
  depth,
  isSelected,
  onSelect,
}: {
  type: CachedType
  depth: number
  isSelected: boolean
  onSelect: (typeId: number) => void
}) {
  const indentPx = depth * 16

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 cursor-pointer hover:bg-surface-tertiary',
        isSelected && 'bg-accent/20'
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: `${indentPx + 8 + 22}px` }}
      onClick={() => onSelect(type.id)}
    >
      <TypeIcon typeId={type.id} categoryId={type.categoryId} size="sm" />
      <span
        className={cn(
          'text-sm truncate min-w-0',
          isSelected && 'text-accent font-medium'
        )}
        title={type.name}
      >
        {type.name}
      </span>
    </div>
  )
})

export function MarketGroupTree({
  tree,
  expandedIds,
  selectedGroupId,
  selectedTypeId,
  onToggleExpand,
  onSelectGroup,
  onSelectType,
}: MarketGroupTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const types = useReferenceCacheStore((s) => s.types)

  const flatRows = useMemo(
    () => flattenTreeWithItems(tree, expandedIds, types),
    [tree, expandedIds, types]
  )

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
          const row = flatRows[virtualRow.index]!
          const key =
            row.kind === 'group' ? `g-${row.node.group.id}` : `i-${row.type.id}`

          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.kind === 'group' ? (
                <MarketGroupRow
                  node={row.node}
                  isExpanded={expandedIds.has(row.node.group.id)}
                  isSelected={selectedGroupId === row.node.group.id}
                  onToggleExpand={onToggleExpand}
                  onSelectGroup={onSelectGroup}
                />
              ) : (
                <ItemRow
                  type={row.type}
                  depth={row.depth}
                  isSelected={selectedTypeId === row.type.id}
                  onSelect={onSelectType}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
