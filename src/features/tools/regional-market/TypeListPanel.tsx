import { memo, useMemo } from 'react'
import { Folder, ChevronRight } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import { useRegionalOrdersStore } from '@/store/regional-orders-store'
import type { MarketGroupNode } from './types'
import { getDescendantMarketGroupIds } from './use-market-groups'

interface TypeListPanelProps {
  selectedGroup: MarketGroupNode | null
  onSelectType: (typeId: number) => void
  onSelectGroup?: (groupId: number) => void
}

const TypeRow = memo(function TypeRow({
  type,
  onSelect,
}: {
  type: CachedType
  onSelect: (typeId: number) => void
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b border-border/50 hover:bg-surface-tertiary/50 cursor-pointer"
      onClick={() => onSelect(type.id)}
    >
      <TypeIcon typeId={type.id} categoryId={type.categoryId} size="sm" />
      <span className="text-sm truncate">{type.name}</span>
    </div>
  )
})

const SubgroupRow = memo(function SubgroupRow({
  node,
  onSelect,
}: {
  node: MarketGroupNode
  onSelect: (groupId: number) => void
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b border-border/50 hover:bg-surface-tertiary/50 cursor-pointer"
      onClick={() => onSelect(node.group.id)}
    >
      <Folder className="h-4 w-4 text-content-secondary flex-shrink-0" />
      <span className="text-sm truncate flex-1">{node.group.name}</span>
      <ChevronRight className="h-4 w-4 text-content-tertiary flex-shrink-0" />
    </div>
  )
})

export function TypeListPanel({
  selectedGroup,
  onSelectType,
  onSelectGroup,
}: TypeListPanelProps) {
  const allTypes = useReferenceCacheStore((s) => s.types)
  const regionId = useRegionalOrdersStore((s) => s.regionId)
  const status = useRegionalOrdersStore((s) => s.status)
  const getAvailableTypeIds = useRegionalOrdersStore(
    (s) => s.getAvailableTypeIds
  )

  const availableTypeIds = useMemo(() => {
    if (status !== 'ready' || !regionId) return undefined
    return getAvailableTypeIds()
  }, [regionId, status, getAvailableTypeIds])

  const groupsWithAvailableItems = useMemo(() => {
    if (!availableTypeIds) return null
    const set = new Set<number>()
    for (const type of allTypes.values()) {
      if (type.marketGroupId && availableTypeIds.has(type.id)) {
        set.add(type.marketGroupId)
      }
    }
    return set
  }, [allTypes, availableTypeIds])

  const filteredTypes = useMemo(() => {
    if (!selectedGroup) return []

    const marketGroupIds = new Set(getDescendantMarketGroupIds(selectedGroup))

    const types: CachedType[] = []
    for (const type of allTypes.values()) {
      if (type.marketGroupId && marketGroupIds.has(type.marketGroupId)) {
        if (availableTypeIds && !availableTypeIds.has(type.id)) continue
        types.push(type)
      }
    }

    types.sort((a, b) => a.name.localeCompare(b.name))
    return types
  }, [selectedGroup, allTypes, availableTypeIds])

  const filteredChildren = useMemo(() => {
    if (!selectedGroup || !groupsWithAvailableItems) {
      return selectedGroup?.children ?? []
    }

    function hasAvailableItems(node: MarketGroupNode): boolean {
      if (groupsWithAvailableItems!.has(node.group.id)) return true
      return node.children.some(hasAvailableItems)
    }

    return selectedGroup.children.filter(hasAvailableItems)
  }, [selectedGroup, groupsWithAvailableItems])

  if (!selectedGroup) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-content-secondary">
        <div className="text-lg font-medium mb-2">No Group Selected</div>
        <div className="text-sm">Select a market group to browse items</div>
      </div>
    )
  }

  const itemCount =
    filteredChildren.length > 0 ? filteredChildren.length : filteredTypes.length
  const itemLabel = filteredChildren.length > 0 ? 'subgroup' : 'item'

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-hidden flex flex-col">
        <div className="sticky top-0 z-10 bg-surface-secondary px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium text-content">
            {selectedGroup.group.name}
          </span>
          <span className="text-xs text-content-secondary">
            {itemCount} {itemLabel}
            {itemCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          {filteredChildren.length > 0 ? (
            filteredChildren.map((child) => (
              <SubgroupRow
                key={child.group.id}
                node={child}
                onSelect={onSelectGroup ?? (() => {})}
              />
            ))
          ) : filteredTypes.length > 0 ? (
            filteredTypes.map((type) => (
              <TypeRow key={type.id} type={type} onSelect={onSelectType} />
            ))
          ) : (
            <div className="h-24 flex items-center justify-center text-content-secondary text-sm">
              No items in this group
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
