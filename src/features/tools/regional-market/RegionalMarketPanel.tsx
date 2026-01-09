import { useCallback, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/shallow'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import { useRegionalOrdersStore } from '@/store/regional-orders-store'
import { useRegionalMarketSessionStore } from '@/store/regional-market-session-store'
import { BUYBACK_REGIONS } from '@/hooks/useBuybackSelection'
import { MarketGroupTree } from './MarketGroupTree'
import { MarketItemSearch } from './MarketItemSearch'
import { MarketBreadcrumb } from './MarketBreadcrumb'
import { TypeListPanel } from './TypeListPanel'
import { OrderDetailPanel } from './OrderDetailPanel'
import { useMarketGroups, getAllGroupIds } from './use-market-groups'
import type { MarketGroupNode } from './types'

interface RegionalMarketPanelProps {
  initialTypeId?: number | null
  onInitialTypeConsumed?: () => void
}

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

export function RegionalMarketPanel({
  initialTypeId,
  onInitialTypeConsumed,
}: RegionalMarketPanelProps) {
  const {
    selectedRegionId,
    selectedMarketGroupId,
    selectedTypeId,
    expandedGroupIds,
  } = useRegionalMarketSessionStore(
    useShallow((s) => ({
      selectedRegionId: s.selectedRegionId,
      selectedMarketGroupId: s.selectedMarketGroupId,
      selectedTypeId: s.selectedTypeId,
      expandedGroupIds: s.expandedGroupIds,
    }))
  )

  const {
    setSelectedRegionId,
    setSelectedMarketGroupId,
    setSelectedTypeId,
    setExpandedGroupIds,
    toggleExpandedGroup,
    expandGroups,
  } = useRegionalMarketSessionStore(
    useShallow((s) => ({
      setSelectedRegionId: s.setSelectedRegionId,
      setSelectedMarketGroupId: s.setSelectedMarketGroupId,
      setSelectedTypeId: s.setSelectedTypeId,
      setExpandedGroupIds: s.setExpandedGroupIds,
      toggleExpandedGroup: s.toggleExpandedGroup,
      expandGroups: s.expandGroups,
    }))
  )

  const { t } = useTranslation('tools')
  const { tree, loading, error } = useMarketGroups()
  const regions = useReferenceCacheStore((s) => s.regions)
  const types = useReferenceCacheStore((s) => s.types)

  const { setRegion, initOrdersStore } = useRegionalOrdersStore(
    useShallow((s) => ({
      setRegion: s.setRegion,
      initOrdersStore: s.init,
    }))
  )

  useEffect(() => {
    initOrdersStore()
  }, [initOrdersStore])

  useEffect(() => {
    setRegion(selectedRegionId)
  }, [selectedRegionId, setRegion])

  const selectType = useCallback(
    (typeId: number) => {
      const type = types.get(typeId)
      if (!type?.marketGroupId) return

      const path = buildBreadcrumbPath(tree, type.marketGroupId)
      const groupIdsToExpand = path.map((node) => node.group.id)

      expandGroups(groupIdsToExpand)
      setSelectedMarketGroupId(type.marketGroupId)
      setSelectedTypeId(type.id)
    },
    [tree, types, expandGroups, setSelectedMarketGroupId, setSelectedTypeId]
  )

  const lastHandledTypeId = useRef<number | null>(null)
  useEffect(() => {
    if (!initialTypeId || loading || tree.length === 0) return
    if (lastHandledTypeId.current === initialTypeId) return
    lastHandledTypeId.current = initialTypeId

    queueMicrotask(() => {
      selectType(initialTypeId)
      onInitialTypeConsumed?.()
    })
  }, [initialTypeId, loading, tree, selectType, onInitialTypeConsumed])

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

  const selectedType = useMemo(() => {
    if (!selectedTypeId) return null
    return types.get(selectedTypeId) ?? null
  }, [types, selectedTypeId])

  const handleSelectGroup = useCallback(
    (groupId: number) => {
      setSelectedMarketGroupId(groupId)
      setSelectedTypeId(null)
      expandGroups([groupId])
    },
    [setSelectedMarketGroupId, setSelectedTypeId, expandGroups]
  )

  const handleBreadcrumbClick = useCallback(
    (groupId: number | null) => {
      setSelectedMarketGroupId(groupId)
      setSelectedTypeId(null)
    },
    [setSelectedMarketGroupId, setSelectedTypeId]
  )

  const handleRegionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedRegionId(parseInt(e.target.value, 10))
    },
    [setSelectedRegionId]
  )

  const handleExpandAll = useCallback(() => {
    const allIds = getAllGroupIds(tree)
    setExpandedGroupIds(new Set(allIds))
  }, [tree, setExpandedGroupIds])

  const handleCollapseAll = useCallback(() => {
    setExpandedGroupIds(new Set())
  }, [setExpandedGroupIds])

  const handleSearchSelect = useCallback(
    (type: CachedType) => {
      selectType(type.id)
    },
    [selectType]
  )

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary">
        {t('regionalMarket.loading')}
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

  const renderContentPanel = () => {
    if (selectedTypeId) {
      return <OrderDetailPanel typeId={selectedTypeId} />
    }

    return (
      <TypeListPanel
        selectedGroup={selectedGroup}
        onSelectType={setSelectedTypeId}
        onSelectGroup={handleSelectGroup}
      />
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border">
        <label className="text-sm text-content-secondary">
          {t('regionalMarket.region')}
        </label>
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
          {t('regionalMarket.expandAll')}
        </button>
        <button
          onClick={handleCollapseAll}
          className="text-xs text-content-secondary hover:text-content px-2 py-1"
        >
          {t('regionalMarket.collapseAll')}
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
              onToggleExpand={toggleExpandedGroup}
              onSelectGroup={handleSelectGroup}
              onSelectType={setSelectedTypeId}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MarketBreadcrumb
            path={breadcrumbPath}
            selectedGroupId={selectedMarketGroupId}
            selectedType={selectedType}
            onNavigate={handleBreadcrumbClick}
          />
          <div className="flex-1 min-h-0 overflow-hidden">
            {renderContentPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}
