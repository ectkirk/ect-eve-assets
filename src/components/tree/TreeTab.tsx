import { useMemo, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAssetData } from '@/hooks/useAssetData'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { TreeTable, useTreeState } from '@/components/tree'
import { buildTree, filterTree, countTreeItems, type AssetWithOwner } from '@/lib/tree-builder'
import { type TreeMode } from '@/lib/tree-types'
import { useTabControls } from '@/context'

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

  const { search, setResultCount } = useTabControls()
  const activeOwnerId = useAuthStore((s) => s.activeOwnerId)

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

  const unfilteredNodes = useMemo(() => {
    void cacheVersion
    if (assetsByOwner.length === 0 || prices.size === 0) return []

    const allAssets: AssetWithOwner[] = []
    const filteredAssets: AssetWithOwner[] = []
    for (const { owner, assets } of assetsByOwner) {
      const isActiveOwner = activeOwnerId === null || ownerKey(owner.type, owner.id) === activeOwnerId
      for (const asset of assets) {
        const aw = { asset, owner }
        allAssets.push(aw)
        if (isActiveOwner) filteredAssets.push(aw)
      }
    }

    return buildTree(filteredAssets, { mode, prices, assetNames, hangarDivisionNames, allAssets })
  }, [assetsByOwner, prices, assetNames, cacheVersion, mode, activeOwnerId, hangarDivisionNames])

  const treeNodes = useMemo(() => {
    return filterTree(unfilteredNodes, search)
  }, [unfilteredNodes, search])

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
