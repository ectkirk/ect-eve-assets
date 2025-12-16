import { useMemo } from 'react'
import { useAssetData, type OwnerAssets } from './useAssetData'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { resolveAllAssets } from '@/lib/asset-resolver'
import type { ResolvedAsset, ResolvedAssetsByOwner } from '@/lib/resolved-asset'

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

  const resolvedAssets = useMemo(() => {
    void assetData.cacheVersion

    if (assetData.unifiedAssetsByOwner.length === 0) return []

    return resolveAllAssets(assetData.unifiedAssetsByOwner, {
      prices: assetData.prices,
      assetNames: assetData.assetNames,
    })
  }, [
    assetData.unifiedAssetsByOwner,
    assetData.prices,
    assetData.assetNames,
    assetData.cacheVersion,
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
