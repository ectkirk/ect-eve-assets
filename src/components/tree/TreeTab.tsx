import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useAssetData } from '@/hooks/useAssetData'
import { TreeTable, useTreeState } from '@/components/tree'
import { buildTree, filterTree, type AssetWithOwner } from '@/lib/tree-builder'
import { type TreeMode } from '@/lib/tree-types'
import { useTabControls } from '@/context'

interface TreeTabProps {
  mode: TreeMode
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return ''
  const minutes = Math.ceil(ms / 60000)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${minutes}m`
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
    cacheVersion,
    update,
    updateProgress,
    canUpdate,
    timeUntilUpdate,
  } = useAssetData()

  const { search } = useTabControls()

  const treeNodes = useMemo(() => {
    void cacheVersion
    if (assetsByOwner.length === 0 || prices.size === 0) return []

    const assetsWithOwners: AssetWithOwner[] = []
    for (const { owner, assets } of assetsByOwner) {
      for (const asset of assets) {
        assetsWithOwners.push({ asset, owner })
      }
    }

    const nodes = buildTree(assetsWithOwners, { mode, prices })
    return filterTree(nodes, search)
  }, [assetsByOwner, prices, cacheVersion, mode, search])

  const { expandedNodes, toggleExpand, expandAll, collapseAll } = useTreeState(treeNodes)

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No characters logged in. Add a character to view assets.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">
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
              <p className="text-red-500">Failed to load assets</p>
              <p className="text-sm text-slate-400 mb-4">{errorMessage}</p>
            </>
          )}
          {!hasError && (
            <p className="text-slate-400 mb-4">No asset data loaded. Click Update to fetch from ESI.</p>
          )}
          <button
            onClick={() => update()}
            disabled={!canUpdate}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {canUpdate ? 'Update Assets' : `Update in ${formatTimeRemaining(timeUntilUpdate)}`}
          </button>
        </div>
      </div>
    )
  }

  if (prices.size === 0) {
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
