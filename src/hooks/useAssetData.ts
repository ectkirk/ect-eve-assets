import { useMemo, useState, useEffect } from 'react'
import { useAuthStore, type Owner } from '@/store/auth-store'
import { useAssetStore, type OwnerAssets } from '@/store/asset-store'
import { subscribe as subscribeToCache } from '@/store/reference-cache'

export type { OwnerAssets }

export interface AssetDataResult {
  assetsByOwner: OwnerAssets[]
  owners: Owner[]
  isLoading: boolean
  hasData: boolean
  hasError: boolean
  errorMessage: string | null
  prices: Map<number, number>
  assetNames: Map<number, string>
  cacheVersion: number
  updateProgress: { current: number; total: number } | null
}

export function useAssetData(): AssetDataResult {
  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const assetsByOwner = useAssetStore((s) => s.assetsByOwner)
  const assetNames = useAssetStore((s) => s.assetNames)
  const prices = useAssetStore((s) => s.prices)
  const isUpdating = useAssetStore((s) => s.isUpdating)
  const updateError = useAssetStore((s) => s.updateError)
  const updateProgress = useAssetStore((s) => s.updateProgress)

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => {
    return subscribeToCache(() => setCacheVersion((v) => v + 1))
  }, [])

  const hasData = assetsByOwner.length > 0

  return {
    assetsByOwner,
    owners,
    isLoading: isUpdating && !hasData,
    hasData,
    hasError: !!updateError,
    errorMessage: updateError,
    prices,
    assetNames,
    cacheVersion,
    updateProgress,
  }
}
