import { useMemo } from 'react'
import { useAssetData, type OwnerAssets } from './useAssetData'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { resolveAllAssets } from '@/lib/asset-resolver'
import type { ResolvedAsset, ResolvedAssetsByOwner } from '@/lib/resolved-asset'
import { useStarbasesStore } from '@/store/starbases-store'
import { useStructuresStore } from '@/store/structures-store'

export interface ResolvedAssetsResult {
  resolvedAssets: ResolvedAsset[]
  resolvedByOwner: ResolvedAssetsByOwner[]
  selectedResolvedAssets: ResolvedAsset[]
  owners: OwnerAssets['owner'][]
  isLoading: boolean
  hasData: boolean
  hasError: boolean
  errorMessage: string | null
  cacheVersion: number
  updateProgress: { current: number; total: number } | null
}

export function useResolvedAssets(): ResolvedAssetsResult {
  const assetData = useAssetData()
  const starbasesByOwner = useStarbasesStore((s) => s.dataByOwner)
  const structuresByOwner = useStructuresStore((s) => s.dataByOwner)

  const { ownedStructureIds, starbaseMoonIds } = useMemo(() => {
    const ids = new Set<number>()
    const moonIds = new Map<number, number>()
    for (const { starbases } of starbasesByOwner) {
      for (const starbase of starbases) {
        ids.add(starbase.starbase_id)
        if (starbase.moon_id) {
          moonIds.set(starbase.starbase_id, starbase.moon_id)
        }
      }
    }
    for (const { structures } of structuresByOwner) {
      for (const structure of structures) {
        ids.add(structure.structure_id)
      }
    }
    return { ownedStructureIds: ids, starbaseMoonIds: moonIds }
  }, [starbasesByOwner, structuresByOwner])

  const resolvedAssets = useMemo(() => {
    void assetData.cacheVersion

    if (assetData.assetsByOwner.length === 0) return []

    return resolveAllAssets(assetData.assetsByOwner, {
      prices: assetData.prices,
      assetNames: assetData.assetNames,
      ownedStructureIds,
      starbaseMoonIds,
    })
  }, [
    assetData.assetsByOwner,
    assetData.prices,
    assetData.assetNames,
    assetData.cacheVersion,
    ownedStructureIds,
    starbaseMoonIds,
  ])

  const resolvedByOwner = useMemo(() => {
    const byOwner = new Map<string, ResolvedAsset[]>()

    for (const resolved of resolvedAssets) {
      const key = ownerKey(resolved.owner.type, resolved.owner.id)
      const existing = byOwner.get(key)
      if (existing) {
        existing.push(resolved)
      } else {
        byOwner.set(key, [resolved])
      }
    }

    const result: ResolvedAssetsByOwner[] = []
    for (const [, assets] of byOwner) {
      if (assets.length > 0) {
        result.push({ owner: assets[0]!.owner, assets })
      }
    }

    return result
  }, [resolvedAssets])

  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const selectedResolvedAssets = useMemo(() => {
    return resolvedAssets.filter((ra) => {
      const key = ownerKey(ra.owner.type, ra.owner.id)
      return selectedSet.has(key)
    })
  }, [resolvedAssets, selectedSet])

  return {
    resolvedAssets,
    resolvedByOwner,
    selectedResolvedAssets,
    owners: assetData.owners,
    isLoading: assetData.isLoading,
    hasData: assetData.hasData,
    hasError: assetData.hasError,
    errorMessage: assetData.errorMessage,
    cacheVersion: assetData.cacheVersion,
    updateProgress: assetData.updateProgress,
  }
}
