import { memo, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Folder, ChevronRight } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import type { MarketGroupNode } from './types'
import { getDescendantMarketGroupIds } from './use-market-groups'

interface TypeListPanelProps {
  selectedGroup: MarketGroupNode | null
  onSelectType: (typeId: number) => void
  onSelectGroup?: (groupId: number) => void
}

const ROW_HEIGHT = 40

type ListRow =
  | { kind: 'subgroup'; node: MarketGroupNode }
  | { kind: 'item'; type: CachedType }

const TypeRow = memo(function TypeRow({
  type,
  onSelect,
}: {
  type: CachedType
  onSelect: (typeId: number) => void
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 border-b border-border/50 hover:bg-surface-tertiary/50 cursor-pointer"
      style={{ height: ROW_HEIGHT }}
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
      className="flex items-center gap-3 px-4 border-b border-border/50 hover:bg-surface-tertiary/50 cursor-pointer"
      style={{ height: ROW_HEIGHT }}
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
  const { t } = useTranslation('tools')
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

  const rows = useMemo((): ListRow[] => {
    if (selectedGroup && selectedGroup.children.length > 0) {
      return selectedGroup.children.map((node) => ({ kind: 'subgroup', node }))
    }
    return filteredTypes.map((type) => ({ kind: 'item', type }))
  }, [selectedGroup, filteredTypes])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const handleSelectGroup = useCallback(
    (groupId: number) => onSelectGroup?.(groupId),
    [onSelectGroup]
  )

  if (!selectedGroup) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-content-secondary">
        <div className="text-lg font-medium mb-2">
          {t('regionalMarket.noGroupSelected')}
        </div>
        <div className="text-sm">{t('regionalMarket.selectGroupPrompt')}</div>
      </div>
    )
  }

  const isSubgroupView = selectedGroup.children.length > 0
  const countLabel = isSubgroupView
    ? t('regionalMarket.subgroupCount', { count: rows.length })
    : t('regionalMarket.itemCount', { count: rows.length })

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-hidden flex flex-col">
        <div className="bg-surface-secondary px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium text-content">
            {selectedGroup.group.name}
          </span>
          <span className="text-xs text-content-secondary">{countLabel}</span>
        </div>

        {rows.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-content-secondary text-sm">
            {t('regionalMarket.noItemsInGroup')}
          </div>
        ) : (
          <div ref={containerRef} className="flex-1 overflow-auto">
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]!
                const key =
                  row.kind === 'subgroup'
                    ? `g-${row.node.group.id}`
                    : `i-${row.type.id}`

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
                    {row.kind === 'subgroup' ? (
                      <SubgroupRow
                        node={row.node}
                        onSelect={handleSelectGroup}
                      />
                    ) : (
                      <TypeRow type={row.type} onSelect={onSelectType} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
