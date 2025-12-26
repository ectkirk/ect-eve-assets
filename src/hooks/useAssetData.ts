import { useMemo } from 'react'
import { useAuthStore, type Owner } from '@/store/auth-store'
import { useAssetStore, type OwnerAssets } from '@/store/asset-store'
import { usePriceStore } from '@/store/price-store'

export type { OwnerAssets }

export interface AssetDataResult {
  assetsByOwner: OwnerAssets[]
  owners: Owner[]
  isLoading: boolean
  hasData: boolean
  hasError: boolean
  errorMessage: string | null
  priceVersion: number
  assetNames: Map<number, string>
  updateProgress: { current: number; total: number } | null
}

export function useAssetData(): AssetDataResult {
  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const assetsByOwner = useAssetStore((s) => s.assetsByOwner)
  const assetNames = useAssetStore((s) => s.assetNames)
  const priceVersion = usePriceStore((s) => s.priceVersion)
  const isUpdating = useAssetStore((s) => s.isUpdating)
  const updateError = useAssetStore((s) => s.updateError)
  const updateProgress = useAssetStore((s) => s.updateProgress)

  const hasData = assetsByOwner.length > 0

  return {
    assetsByOwner,
    owners,
    isLoading: isUpdating && !hasData,
    hasData,
    hasError: !!updateError,
    errorMessage: updateError,
    priceVersion,
    assetNames,
    updateProgress,
  }
}
