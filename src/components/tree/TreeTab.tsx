import { useMemo, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useResolvedAssets } from '@/hooks/useResolvedAssets'
import { useDivisionsStore } from '@/store/divisions-store'
import { TreeTable, useTreeState } from '@/components/tree'
import { buildTree, filterTree, getTreeCategories, shouldIncludeByMode } from '@/lib/tree-builder'
import { TreeMode } from '@/lib/tree-types'
import { useTabControls } from '@/context'
import { matchesSearch } from '@/lib/resolved-asset'

interface TreeTabProps {
  mode: TreeMode
}

export function TreeTab({ mode }: TreeTabProps) {
  const {
    selectedResolvedAssets,
    owners,
    isLoading,
    hasData,
    hasError,
    errorMessage,
    cacheVersion,
    updateProgress,
  } = useResolvedAssets()

  const [categoryFilter, setCategoryFilterValue] = useState('')
  const [assetTypeFilter, setAssetTypeFilterValue] = useState('')
  const { search, setResultCount, setCategoryFilter, setAssetTypeFilter, setTotalValue } = useTabControls()

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
    if (selectedResolvedAssets.length === 0) return []

    return buildTree(selectedResolvedAssets, {
      mode: effectiveMode,
      hangarDivisionNames,
    })
  }, [selectedResolvedAssets, cacheVersion, effectiveMode, hangarDivisionNames])

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

  const { sourceCount, totalValue } = useMemo(() => {
    let showing = 0
    let value = 0
    for (const ra of selectedResolvedAssets) {
      if (!ra.modeFlags.isOwnedStructure && !ra.modeFlags.isMarketOrder && !ra.modeFlags.isContract) {
        value += ra.totalValue
      }
      if (!shouldIncludeByMode(ra, effectiveMode)) continue
      if (categoryFilter && ra.categoryName !== categoryFilter) continue
      if (!matchesSearch(ra, search)) continue
      showing++
    }
    return {
      sourceCount: { showing, total: selectedResolvedAssets.length },
      totalValue: value,
    }
  }, [selectedResolvedAssets, effectiveMode, categoryFilter, search])

  useEffect(() => {
    setResultCount(sourceCount)
    return () => setResultCount(null)
  }, [sourceCount, setResultCount])

  useEffect(() => {
    setTotalValue({ value: totalValue })
    return () => setTotalValue(null)
  }, [totalValue, setTotalValue])

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
