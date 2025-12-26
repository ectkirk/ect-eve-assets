import { useState, useCallback, useMemo } from 'react'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { MarketGroupTree } from './MarketGroupTree'
import { TypeListPanel } from './TypeListPanel'
import { OrderDetailPanel } from './OrderDetailPanel'
import { useMarketGroups, getAllGroupIds } from './use-market-groups'
import type { MarketGroupNode } from './types'

const THE_FORGE_REGION_ID = 10000002

function findGroupNode(
  nodes: MarketGroupNode[],
  groupId: number
): MarketGroupNode | null {
  for (const node of nodes) {
    if (node.group.id === groupId) return node
    const found = findGroupNode(node.children, groupId)
    if (found) return found
  }
  return null
}

export function RegionalMarketPanel() {
  const [selectedRegionId, setSelectedRegionId] = useState(THE_FORGE_REGION_ID)
  const [selectedMarketGroupId, setSelectedMarketGroupId] = useState<
    number | null
  >(null)
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(
    new Set()
  )

  const { tree, loading, error } = useMarketGroups()
  const regions = useReferenceCacheStore((s) => s.regions)

  const sortedRegions = useMemo(() => {
    const list = Array.from(regions.values())
    list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [regions])

  const selectedGroup = useMemo(() => {
    if (!selectedMarketGroupId) return null
    return findGroupNode(tree, selectedMarketGroupId)
  }, [tree, selectedMarketGroupId])

  const handleToggleExpand = useCallback((groupId: number) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])

  const handleSelectGroup = useCallback((groupId: number) => {
    setSelectedMarketGroupId(groupId)
    setSelectedTypeId(null)
  }, [])

  const handleSelectType = useCallback((typeId: number) => {
    setSelectedTypeId(typeId)
  }, [])

  const handleRegionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedRegionId(parseInt(e.target.value, 10))
    },
    []
  )

  const handleExpandAll = useCallback(() => {
    const allIds = getAllGroupIds(tree)
    setExpandedGroupIds(new Set(allIds))
  }, [tree])

  const handleCollapseAll = useCallback(() => {
    setExpandedGroupIds(new Set())
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary">
        Loading market groups...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-status-negative">
        {error}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border">
        <label className="text-sm text-content-secondary">Region:</label>
        <select
          value={selectedRegionId}
          onChange={handleRegionChange}
          className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-hidden"
        >
          {sortedRegions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={handleExpandAll}
          className="text-xs text-content-secondary hover:text-content px-2 py-1"
        >
          Expand All
        </button>
        <button
          onClick={handleCollapseAll}
          className="text-xs text-content-secondary hover:text-content px-2 py-1"
        >
          Collapse All
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-64 border-r border-border flex-shrink-0 overflow-hidden">
          <MarketGroupTree
            tree={tree}
            expandedIds={expandedGroupIds}
            selectedGroupId={selectedMarketGroupId}
            onToggleExpand={handleToggleExpand}
            onSelectGroup={handleSelectGroup}
          />
        </div>

        <div className="w-72 border-r border-border flex-shrink-0 overflow-hidden">
          <TypeListPanel
            selectedGroup={selectedGroup}
            selectedTypeId={selectedTypeId}
            onSelectType={handleSelectType}
          />
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <OrderDetailPanel
            regionId={selectedRegionId}
            typeId={selectedTypeId}
          />
        </div>
      </div>
    </div>
  )
}
