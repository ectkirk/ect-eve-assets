import { memo, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TypeIcon } from '@/components/ui/type-icon'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import { formatISK } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { MarketGroupNode } from './types'
import { getDescendantMarketGroupIds } from './use-market-groups'

interface TypeListPanelProps {
  selectedGroup: MarketGroupNode | null
  selectedTypeId: number | null
  onSelectType: (typeId: number) => void
}

const ROW_HEIGHT = 44

const TypeRow = memo(function TypeRow({
  type,
  isSelected,
  onSelect,
}: {
  type: CachedType
  isSelected: boolean
  onSelect: (typeId: number) => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 cursor-pointer hover:bg-surface-tertiary',
        isSelected && 'bg-accent/20'
      )}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(type.id)}
    >
      <TypeIcon typeId={type.id} categoryId={type.categoryId} size="lg" />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-sm truncate',
            isSelected && 'text-accent font-medium'
          )}
          title={type.name}
        >
          {type.name}
        </div>
        <div className="text-xs text-content-secondary">
          {type.jitaPrice ? formatISK(type.jitaPrice) : 'No price data'}
        </div>
      </div>
    </div>
  )
})

export function TypeListPanel({
  selectedGroup,
  selectedTypeId,
  onSelectType,
}: TypeListPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const allTypes = useReferenceCacheStore((s) => s.types)

  const filteredTypes = useMemo(() => {
    if (!selectedGroup) return []

    const marketGroupIds = new Set(getDescendantMarketGroupIds(selectedGroup))

    const types: CachedType[] = []
    for (const type of allTypes.values()) {
      if (type.marketGroupId && marketGroupIds.has(type.marketGroupId)) {
        types.push(type)
      }
    }

    types.sort((a, b) => a.name.localeCompare(b.name))
    return types
  }, [selectedGroup, allTypes])

  const virtualizer = useVirtualizer({
    count: filteredTypes.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const virtualRows = virtualizer.getVirtualItems()

  if (!selectedGroup) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        Select a market group
      </div>
    )
  }

  if (filteredTypes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        No items in this group
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border-subtle text-sm text-content-secondary">
        {filteredTypes.length} item{filteredTypes.length !== 1 ? 's' : ''}
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const type = filteredTypes[virtualRow.index]!
            return (
              <div
                key={type.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <TypeRow
                  type={type}
                  isSelected={selectedTypeId === type.id}
                  onSelect={onSelectType}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
