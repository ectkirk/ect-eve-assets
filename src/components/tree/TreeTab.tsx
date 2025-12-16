import { useMemo, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAssetData } from '@/hooks/useAssetData'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { useContractsStore } from '@/store/contracts-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { TreeTable, useTreeState } from '@/components/tree'
import { buildTree, filterTree, countTreeItems, getTreeCategories, markSourceFlags, type AssetWithOwner } from '@/lib/tree-builder'
import { TreeMode } from '@/lib/tree-types'
import { useTabControls } from '@/context'
import type { ESIAsset } from '@/api/endpoints/assets'

interface TreeTabProps {
  mode: TreeMode
}

export function TreeTab({ mode }: TreeTabProps) {
  const {
    assetsByOwner,
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

  const contractsByOwner = useContractsStore((s) => s.contractsByOwner)
  const ordersByOwner = useMarketOrdersStore((s) => s.dataByOwner)

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
    if (assetsByOwner.length === 0 || prices.size === 0) return []

    const allAssets: AssetWithOwner[] = []
    const filteredAssets: AssetWithOwner[] = []
    const contractItemIds = new Set<number>()
    const orderItemIds = new Set<number>()
    const orderPrices = new Map<number, number>()

    const includeRegularAssets = effectiveMode !== TreeMode.CONTRACTS && effectiveMode !== TreeMode.MARKET_ORDERS
    const includeContracts = effectiveMode === TreeMode.ALL || effectiveMode === TreeMode.CONTRACTS
    const includeOrders = effectiveMode === TreeMode.ALL || effectiveMode === TreeMode.MARKET_ORDERS

    for (const { owner, assets } of assetsByOwner) {
      const isSelected = selectedSet.has(ownerKey(owner.type, owner.id))
      for (const asset of assets) {
        const aw = { asset, owner }
        allAssets.push(aw)
        if (isSelected && includeRegularAssets) filteredAssets.push(aw)
      }
    }

    if (includeContracts || includeOrders) {
      const ownerIds = new Set(owners.map((o) => o.characterId))
      const ownerCorpIds = new Set(owners.filter((o) => o.corporationId).map((o) => o.corporationId))

      if (includeContracts) {
        for (const { owner, contracts } of contractsByOwner) {
          const isSelected = selectedSet.has(ownerKey(owner.type, owner.id))
          if (!isSelected) continue

          for (const { contract, items } of contracts) {
            if (contract.status !== 'outstanding') continue
            const isIssuer = ownerIds.has(contract.issuer_id) || ownerCorpIds.has(contract.issuer_corporation_id)
            if (!isIssuer) continue

            const locationId = contract.start_location_id ?? 0

            for (const item of items) {
              if (!item.is_included) continue

              const syntheticAsset: ESIAsset = {
                item_id: item.record_id,
                type_id: item.type_id,
                location_id: locationId,
                location_type: locationId > 1_000_000_000_000 ? 'other' : 'station',
                location_flag: 'InContract',
                quantity: item.quantity,
                is_singleton: item.is_singleton ?? false,
                is_blueprint_copy: item.is_blueprint_copy,
              }
              contractItemIds.add(item.record_id)
              filteredAssets.push({ asset: syntheticAsset, owner })
              allAssets.push({ asset: syntheticAsset, owner })
            }
          }
        }
      }

      if (includeOrders) {
        for (const { owner, orders } of ordersByOwner) {
          const isSelected = selectedSet.has(ownerKey(owner.type, owner.id))
          if (!isSelected) continue

          for (const order of orders) {
            if (order.is_buy_order) continue
            if (order.volume_remain <= 0) continue

            const syntheticAsset: ESIAsset = {
              item_id: order.order_id,
              type_id: order.type_id,
              location_id: order.location_id,
              location_type: order.location_id > 1_000_000_000_000 ? 'other' : 'station',
              location_flag: 'SellOrder',
              quantity: order.volume_remain,
              is_singleton: false,
            }
            orderItemIds.add(order.order_id)
            orderPrices.set(order.order_id, order.price)
            filteredAssets.push({ asset: syntheticAsset, owner })
            allAssets.push({ asset: syntheticAsset, owner })
          }
        }
      }
    }

    const treeMode = effectiveMode === TreeMode.CONTRACTS || effectiveMode === TreeMode.MARKET_ORDERS
      ? TreeMode.ALL
      : effectiveMode
    const nodes = buildTree(filteredAssets, { mode: treeMode, prices, assetNames, hangarDivisionNames, allAssets, orderPrices })

    if (contractItemIds.size > 0 || orderItemIds.size > 0) {
      markSourceFlags(nodes, contractItemIds, orderItemIds)
    }

    return nodes
  }, [assetsByOwner, prices, assetNames, cacheVersion, effectiveMode, selectedSet, hangarDivisionNames, contractsByOwner, ordersByOwner, owners])

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
