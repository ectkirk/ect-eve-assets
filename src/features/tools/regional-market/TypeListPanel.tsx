import { memo, useMemo, useState, useEffect } from 'react'
import { Folder, ChevronRight } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import { useRegionalOrdersStore } from '@/store/regional-orders-store'
import { getTypeInfo } from '@/api/endpoints/universe'
import type { MarketGroupNode } from './types'
import { getDescendantMarketGroupIds } from './use-market-groups'

interface TypeListPanelProps {
  selectedGroup: MarketGroupNode | null
  onSelectType: (typeId: number) => void
  onSelectGroup?: (groupId: number) => void
}

const DESCRIPTION_CACHE_MAX_SIZE = 500
const descriptionCache = new Map<number, string>()

function cacheDescription(typeId: number, description: string): void {
  if (descriptionCache.size >= DESCRIPTION_CACHE_MAX_SIZE) {
    const firstKey = descriptionCache.keys().next().value
    if (firstKey !== undefined) descriptionCache.delete(firstKey)
  }
  descriptionCache.set(typeId, description)
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

const TypeCard = memo(function TypeCard({
  type,
  onSelect,
  isVisible,
}: {
  type: CachedType
  onSelect: (typeId: number) => void
  isVisible: boolean
}) {
  const [description, setDescription] = useState<string | null>(
    descriptionCache.get(type.id) ?? null
  )

  useEffect(() => {
    if (!isVisible || description !== null) return

    let cancelled = false
    getTypeInfo(type.id)
      .then((info) => {
        if (cancelled) return
        const desc = info.description ? stripHtmlTags(info.description) : ''
        cacheDescription(type.id, desc)
        setDescription(desc)
      })
      .catch(() => {
        if (!cancelled) {
          cacheDescription(type.id, '')
          setDescription('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [type.id, isVisible, description])

  return (
    <div
      className="flex gap-4 p-4 mx-3 my-1.5 rounded border border-border/50 hover:border-border hover:bg-surface-tertiary/50 transition-colors cursor-pointer"
      onClick={() => onSelect(type.id)}
    >
      <TypeIcon typeId={type.id} categoryId={type.categoryId} size="xl" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-content" title={type.name}>
          {type.name}
        </div>
        {description ? (
          <p className="text-xs text-content-secondary mt-1.5 leading-relaxed">
            {description}
          </p>
        ) : (
          <div className="text-xs text-content-tertiary italic mt-1.5">
            Loading...
          </div>
        )}
      </div>
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
        <div className="text-lg font-medium mb-2">No Type Selected</div>
        <div className="text-sm">Select a market group to browse items</div>
      </div>
    )
  }

  if (filteredChildren.length > 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-2.5 border-b border-border bg-surface-secondary">
          <div className="font-medium text-sm">{selectedGroup.group.name}</div>
          <div className="text-xs text-content-secondary mt-0.5">
            {filteredChildren.length} subgroup
            {filteredChildren.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {filteredChildren.map((child) => (
            <button
              key={child.group.id}
              onClick={() => onSelectGroup?.(child.group.id)}
              className="w-full flex items-center gap-3 p-3 rounded border border-border/50 hover:border-border hover:bg-surface-tertiary/50 text-left transition-colors mb-2"
            >
              <Folder className="h-5 w-5 text-content-secondary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {child.group.name}
                </div>
                <div className="text-xs text-content-secondary">
                  {child.children.length > 0 ? 'Browse' : 'View items'}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-content-tertiary flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (filteredTypes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-content-secondary">
        <div className="text-sm">No items in this group</div>
        <div className="text-xs mt-1">
          Try selecting a different market group
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2.5 border-b border-border bg-surface-secondary">
        <div className="font-medium text-sm">{selectedGroup.group.name}</div>
        <div className="text-xs text-content-secondary mt-0.5">
          {filteredTypes.length} item{filteredTypes.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {filteredTypes.map((type) => (
          <TypeCard
            key={type.id}
            type={type}
            onSelect={onSelectType}
            isVisible
          />
        ))}
      </div>
    </div>
  )
}
