import { useMemo, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAssetData } from '@/hooks/useAssetData'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { TreeTable, useTreeState } from '@/components/tree'
import { buildTree, filterTree, countTreeItems, type AssetWithOwner } from '@/lib/tree-builder'
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

  const { search, setResultCount } = useTabControls()
  const activeOwnerId = useAuthStore((s) => s.activeOwnerId)

  const unfilteredNodes = useMemo(() => {
    void cacheVersion
    if (assetsByOwner.length === 0 || prices.size === 0) return []

    const assetsWithOwners: AssetWithOwner[] = []
    for (const { owner, assets } of assetsByOwner) {
      if (activeOwnerId !== null && ownerKey(owner.type, owner.id) !== activeOwnerId) continue
      for (const asset of assets) {
        assetsWithOwners.push({ asset, owner })
      }
    }

    return buildTree(assetsWithOwners, { mode, prices })
  }, [assetsByOwner, prices, cacheVersion, mode, activeOwnerId])

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
