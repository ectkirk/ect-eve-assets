import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import { useRegionalOrdersStore } from '@/store/regional-orders-store'
import { BUYBACK_REGIONS } from '@/hooks/useBuybackSelection'
import { TypeIcon } from '@/components/ui/type-icon'
import { MarketGroupTree } from './MarketGroupTree'
import { MarketItemSearch } from './MarketItemSearch'
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

function buildBreadcrumbPath(
  tree: MarketGroupNode[],
  groupId: number
): MarketGroupNode[] {
  const path: MarketGroupNode[] = []

  function findPath(nodes: MarketGroupNode[]): boolean {
    for (const node of nodes) {
      if (node.group.id === groupId) {
        path.push(node)
        return true
      }
      if (findPath(node.children)) {
        path.unshift(node)
        return true
      }
    }
    return false
  }

  findPath(tree)
  return path
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
  const types = useReferenceCacheStore((s) => s.types)

  const ordersStatus = useRegionalOrdersStore((s) => s.status)
  const ordersProgress = useRegionalOrdersStore((s) => s.progress)
  const setRegion = useRegionalOrdersStore((s) => s.setRegion)
  const initOrdersStore = useRegionalOrdersStore((s) => s.init)

  useEffect(() => {
    initOrdersStore()
  }, [initOrdersStore])

  useEffect(() => {
    setRegion(selectedRegionId)
  }, [selectedRegionId, setRegion])

  const sortedRegions = useMemo(() => {
    const list = Array.from(regions.values()).filter((r) =>
      BUYBACK_REGIONS.has(r.id)
    )
    list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [regions])

  const selectedGroup = useMemo(() => {
    if (!selectedMarketGroupId) return null
    return findGroupNode(tree, selectedMarketGroupId)
  }, [tree, selectedMarketGroupId])

  const breadcrumbPath = useMemo(() => {
    if (!selectedMarketGroupId) return []
    return buildBreadcrumbPath(tree, selectedMarketGroupId)
  }, [tree, selectedMarketGroupId])

  const selectedTypeName = useMemo(() => {
    if (!selectedTypeId) return null
    return types.get(selectedTypeId)?.name ?? null
  }, [types, selectedTypeId])

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
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      next.add(groupId)
      return next
    })
  }, [])

  const handleSelectType = useCallback((typeId: number) => {
    setSelectedTypeId(typeId)
  }, [])

  const handleBreadcrumbClick = useCallback((groupId: number | null) => {
    if (groupId === null) {
      setSelectedMarketGroupId(null)
      setSelectedTypeId(null)
    } else {
      setSelectedMarketGroupId(groupId)
      setSelectedTypeId(null)
    }
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

  const handleSearchSelect = useCallback(
    (type: CachedType) => {
      if (!type.marketGroupId) return

      const path = buildBreadcrumbPath(tree, type.marketGroupId)
      const groupIdsToExpand = path.map((node) => node.group.id)

      setExpandedGroupIds((prev) => {
        const next = new Set(prev)
        for (const id of groupIdsToExpand) next.add(id)
        return next
      })
      setSelectedMarketGroupId(type.marketGroupId)
      setSelectedTypeId(type.id)
    },
    [tree]
  )

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

  const selectedType = selectedTypeId ? types.get(selectedTypeId) : null

  const renderBreadcrumb = () => {
    if (breadcrumbPath.length === 0 && !selectedTypeId) return null

    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border text-sm overflow-x-auto">
        {selectedTypeId && selectedType && (
          <TypeIcon
            typeId={selectedTypeId}
            categoryId={selectedType.categoryId}
            size="lg"
          />
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleBreadcrumbClick(null)}
            className="text-content-secondary hover:text-accent shrink-0"
          >
            Market
          </button>
          {breadcrumbPath.map((node) => (
            <span
              key={node.group.id}
              className="flex items-center gap-1 shrink-0"
            >
              <span className="text-content-tertiary">/</span>
              <button
                onClick={() => handleBreadcrumbClick(node.group.id)}
                className={
                  node.group.id === selectedMarketGroupId && !selectedTypeId
                    ? 'text-content font-medium'
                    : 'text-content-secondary hover:text-accent'
                }
              >
                {node.group.name}
              </button>
            </span>
          ))}
          {selectedTypeId && selectedTypeName && (
            <span className="flex items-center gap-1 shrink-0">
              <span className="text-content-tertiary">/</span>
              <span className="text-content font-medium">
                {selectedTypeName}
              </span>
            </span>
          )}
        </div>
      </div>
    )
  }

  const renderContentPanel = () => {
    if (selectedTypeId) {
      return <OrderDetailPanel typeId={selectedTypeId} />
    }

    return (
      <TypeListPanel
        selectedGroup={selectedGroup}
        onSelectType={handleSelectType}
        onSelectGroup={handleSelectGroup}
      />
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border">
        <label className="text-sm text-content-secondary">Region:</label>
        <select
          value={selectedRegionId}
          onChange={handleRegionChange}
          disabled={ordersStatus === 'loading'}
          className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-hidden disabled:opacity-50"
        >
          {sortedRegions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
        {ordersStatus === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            {ordersProgress ? (
              <>
                <div className="w-32 h-2 bg-surface-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-150"
                    style={{
                      width: `${(ordersProgress.current / ordersProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <span className="tabular-nums text-xs">
                  {ordersProgress.current}/{ordersProgress.total}
                </span>
              </>
            ) : (
              <span className="text-xs">Loading...</span>
            )}
          </div>
        )}
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
        <div className="w-64 border-r border-border flex-shrink-0 flex flex-col overflow-hidden">
          <div className="border-b border-border">
            <MarketItemSearch onSelectType={handleSearchSelect} />
          </div>
          <div className="flex-1 min-h-0">
            <MarketGroupTree
              tree={tree}
              expandedIds={expandedGroupIds}
              selectedGroupId={selectedMarketGroupId}
              selectedTypeId={selectedTypeId}
              onToggleExpand={handleToggleExpand}
              onSelectGroup={handleSelectGroup}
              onSelectType={handleSelectType}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {renderBreadcrumb()}
          <div className="flex-1 min-h-0 overflow-hidden">
            {renderContentPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}
