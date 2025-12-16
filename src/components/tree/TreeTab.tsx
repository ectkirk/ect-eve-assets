import { useMemo, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAssetData } from '@/hooks/useAssetData'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { TreeTable, useTreeState } from '@/components/tree'
import { buildTree, filterTree, countTreeItems, getTreeCategories, markSourceFlags, type AssetWithOwner } from '@/lib/tree-builder'
import { TreeMode } from '@/lib/tree-types'
import { useTabControls } from '@/context'

interface TreeTabProps {
  mode: TreeMode
}

export function TreeTab({ mode }: TreeTabProps) {
  const {
    unifiedAssetsByOwner,
    owners,
    isLoading,
    hasData,
    hasError,
    errorMessage,
    prices,
    assetNames,
    cacheVersion,
    updateProgress,
  } = useAssetData()

  const [categoryFilter, setCategoryFilterValue] = useState('')
  const [assetTypeFilter, setAssetTypeFilterValue] = useState('')
  const { search, setResultCount, setCategoryFilter, setAssetTypeFilter } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const divisionsInit = useDivisionsStore((s) => s.init)
  const divisionsInitialized = useDivisionsStore((s) => s.initialized)
  const divisionsByCorp = useDivisionsStore((s) => s.divisionsByCorp)
  const fetchDivisionsForOwner = useDivisionsStore((s) => s.fetchForOwner)

  useEffect(() => {
    divisionsInit()
  }, [divisionsInit])

  useEffect(() => {
    if (!divisionsInitialized) return
    for (const owner of owners) {
      if (owner.type === 'corporation') {
        fetchDivisionsForOwner(owner)
      }
    }
  }, [divisionsInitialized, owners, fetchDivisionsForOwner])

  const hangarDivisionNames = useMemo(() => {
    const map = new Map<number, string>()
    for (const [, divisions] of divisionsByCorp) {
      for (const hangar of divisions.hangar) {
        if (hangar.name) {
          map.set(hangar.division, hangar.name)
        }
      }
    }
    return map
  }, [divisionsByCorp])

  const effectiveMode = useMemo(() => {
    if (mode === TreeMode.ALL && assetTypeFilter) {
      return TreeMode[assetTypeFilter as keyof typeof TreeMode] ?? TreeMode.ALL
    }
    return mode
  }, [mode, assetTypeFilter])

  const unfilteredNodes = useMemo(() => {
    void cacheVersion
    if (unifiedAssetsByOwner.length === 0 || prices.size === 0) return []

    const allAssets: AssetWithOwner[] = []
    const filteredAssets: AssetWithOwner[] = []
    const contractItemIds = new Set<number>()
    const orderItemIds = new Set<number>()

    const includeRegularAssets = effectiveMode !== TreeMode.CONTRACTS && effectiveMode !== TreeMode.MARKET_ORDERS
    const includeContracts = effectiveMode === TreeMode.ALL || effectiveMode === TreeMode.CONTRACTS
    const includeOrders = effectiveMode === TreeMode.ALL || effectiveMode === TreeMode.MARKET_ORDERS

    for (const { owner, assets } of unifiedAssetsByOwner) {
      const isSelected = selectedSet.has(ownerKey(owner.type, owner.id))
      for (const asset of assets) {
        const isContract = asset.location_flag === 'InContract'
        const isOrder = asset.location_flag === 'SellOrder'
        const isRegular = !isContract && !isOrder

        const aw = { asset, owner }
        allAssets.push(aw)

        if (!isSelected) continue

        if (isContract) {
          contractItemIds.add(asset.item_id)
          if (includeContracts) filteredAssets.push(aw)
        } else if (isOrder) {
          orderItemIds.add(asset.item_id)
          if (includeOrders) filteredAssets.push(aw)
        } else if (isRegular && includeRegularAssets) {
          filteredAssets.push(aw)
        }
      }
    }

    const treeMode = effectiveMode === TreeMode.CONTRACTS || effectiveMode === TreeMode.MARKET_ORDERS
      ? TreeMode.ALL
      : effectiveMode
    const nodes = buildTree(filteredAssets, { mode: treeMode, prices, assetNames, hangarDivisionNames, allAssets })

    if (contractItemIds.size > 0 || orderItemIds.size > 0) {
      markSourceFlags(nodes, contractItemIds, orderItemIds)
    }

    return nodes
  }, [unifiedAssetsByOwner, prices, assetNames, cacheVersion, effectiveMode, selectedSet, hangarDivisionNames])

  const categories = useMemo(() => getTreeCategories(unfilteredNodes), [unfilteredNodes])

  const treeNodes = useMemo(() => {
    return filterTree(unfilteredNodes, search, categoryFilter || undefined)
  }, [unfilteredNodes, search, categoryFilter])

  useEffect(() => {
    setCategoryFilter({
      categories,
      value: categoryFilter,
      onChange: setCategoryFilterValue,
    })
    return () => setCategoryFilter(null)
  }, [categories, categoryFilter, setCategoryFilter])

  useEffect(() => {
    if (mode === TreeMode.ALL) {
      setAssetTypeFilter({
        value: assetTypeFilter,
        onChange: setAssetTypeFilterValue,
      })
    }
    return () => setAssetTypeFilter(null)
  }, [mode, assetTypeFilter, setAssetTypeFilter])

  useEffect(() => {
    const total = countTreeItems(unfilteredNodes)
    const showing = countTreeItems(treeNodes)
    setResultCount({ showing, total })
    return () => setResultCount(null)
  }, [unfilteredNodes, treeNodes, setResultCount])

  const { expandedNodes, toggleExpand, expandAll, collapseAll } = useTreeState(treeNodes)

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-content-secondary">No characters logged in. Add a character to view assets.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" />
          <p className="mt-2 text-content-secondary">
            {updateProgress
              ? `Fetching assets (${updateProgress.current + 1}/${updateProgress.total})...`
              : 'Loading assets...'}
          </p>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {hasError && (
            <>
              <p className="text-semantic-negative">Failed to load assets</p>
              <p className="text-sm text-content-secondary mb-4">{errorMessage}</p>
            </>
          )}
          {!hasError && (
            <p className="text-content-secondary">No asset data loaded yet.</p>
          )}
        </div>
      </div>
    )
  }

  if (prices.size === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <span className="ml-2 text-content-secondary">Loading prices...</span>
      </div>
    )
  }

  return (
    <TreeTable
      nodes={treeNodes}
      expandedNodes={expandedNodes}
      onToggleExpand={toggleExpand}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      storageKey={`tree-${mode.toLowerCase()}`}
    />
  )
}
