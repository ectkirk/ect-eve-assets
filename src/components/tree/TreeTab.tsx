import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useAssetData } from '@/hooks/useAssetData'
import { TreeTable, useTreeState } from '@/components/tree'
import { buildTree, type AssetWithOwner } from '@/lib/tree-builder'
import { type TreeMode } from '@/lib/tree-types'

interface TreeTabProps {
  mode: TreeMode
}

export function TreeTab({ mode }: TreeTabProps) {
  const {
    assetsByOwner,
    owners,
    isLoading,
    isFetching,
    hasError,
    firstError,
    typeProgress,
    prices,
    cacheVersion,
  } = useAssetData()

  const treeNodes = useMemo(() => {
    void cacheVersion
    if (assetsByOwner.length === 0 || prices.size === 0) return []

    const assetsWithOwners: AssetWithOwner[] = []
    for (const { owner, assets } of assetsByOwner) {
      for (const asset of assets) {
        assetsWithOwners.push({ asset, owner })
      }
    }

    return buildTree(assetsWithOwners, { mode, prices })
  }, [assetsByOwner, prices, cacheVersion, mode])

  const { expandedNodes, toggleExpand, expandAll, collapseAll } = useTreeState(treeNodes)

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No characters logged in. Add a character to view assets.</p>
      </div>
    )
  }

  if ((isLoading || isFetching) && treeNodes.length === 0 && assetsByOwner.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-400">Loading assets...</span>
      </div>
    )
  }

  if (typeProgress && treeNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">Resolving item types...</p>
          <p className="text-sm text-slate-500">
            {typeProgress.resolved} / {typeProgress.total}
          </p>
        </div>
      </div>
    )
  }

  if (hasError && treeNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500">Failed to load assets</p>
          <p className="text-sm text-slate-400">
            {firstError instanceof Error ? firstError.message : 'Unknown error'}
          </p>
        </div>
      </div>
    )
  }

  if (assetsByOwner.length > 0 && prices.size === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-400">Loading prices...</span>
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
    />
  )
}
