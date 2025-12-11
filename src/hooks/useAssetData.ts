import { useMemo, useState, useEffect, useRef } from 'react'
import { useAuthStore, type Owner } from '@/store/auth-store'
import { useAssetStore, type OwnerAssets } from '@/store/asset-store'
import { type ESIAsset } from '@/api/endpoints/assets'
import { fetchAbyssalPrices, isAbyssalTypeId, hasCachedAbyssalPrice } from '@/api/mutamarket-client'
import {
  hasType,
  getType,
  hasStructure,
  hasLocation,
  getStructure,
  subscribe as subscribeToCache,
} from '@/store/reference-cache'
import { resolveStructures } from '@/api/endpoints/universe'
import { resolveLocations } from '@/api/ref-client'

let resolvingStructures = false
let resolvingLocations = false

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
  isRefreshingAbyssals: boolean
  refreshAbyssalPrices: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateProgress: { current: number; total: number } | null
  canUpdate: boolean
  timeUntilUpdate: number
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
  const update = useAssetStore((s) => s.update)
  const canUpdateFn = useAssetStore((s) => s.canUpdate)
  const getTimeUntilUpdateFn = useAssetStore((s) => s.getTimeUntilUpdate)

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const canUpdate = canUpdateFn()
  const timeUntilUpdate = getTimeUntilUpdateFn()

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => {
    return subscribeToCache(() => setCacheVersion((v) => v + 1))
  }, [])

  const assetDataKey = assetsByOwner
    .map((d) => `${d.owner.type}-${d.owner.id}`)
    .sort()
    .join(',')

  const assetsByOwnerRef = useRef(assetsByOwner)
  assetsByOwnerRef.current = assetsByOwner

  // Structure resolution (ESI - only for unknown structures)
  useEffect(() => {
    const data = assetsByOwnerRef.current
    if (resolvingStructures || data.length === 0) return

    const itemIdToOwner = new Map<number, Owner>()
    const itemIdToAsset = new Map<number, ESIAsset>()
    for (const { owner, assets } of data) {
      for (const asset of assets) {
        itemIdToAsset.set(asset.item_id, asset)
        itemIdToOwner.set(asset.item_id, owner)
      }
    }

    const getRootInfo = (
      asset: ESIAsset
    ): { structureId: number | null; owner: Owner | undefined } => {
      let current = asset
      let owner = itemIdToOwner.get(asset.item_id)
      while (current.location_type === 'item') {
        const parent = itemIdToAsset.get(current.location_id)
        if (!parent) break
        current = parent
        owner = itemIdToOwner.get(current.item_id)
      }
      if (current.location_id > 1_000_000_000_000) return { structureId: current.location_id, owner }
      return { structureId: null, owner }
    }

    const structureToCharacter = new Map<number, number>()
    for (const { owner, assets } of data) {
      for (const asset of assets) {
        const type = hasType(asset.type_id) ? getType(asset.type_id) : undefined
        if (
          type?.categoryId === 65 &&
          asset.location_type === 'solar_system' &&
          !hasStructure(asset.item_id)
        ) {
          structureToCharacter.set(asset.item_id, owner.characterId)
        }

        const { structureId, owner: rootOwner } = getRootInfo(asset)
        if (structureId && !hasStructure(structureId) && rootOwner) {
          structureToCharacter.set(structureId, rootOwner.characterId)
        }
      }
    }
    if (structureToCharacter.size === 0) return

    resolvingStructures = true

    resolveStructures(structureToCharacter)
      .catch(() => {})
      .finally(() => {
        resolvingStructures = false
      })
  }, [assetDataKey])

  // Location resolution (ref API - ok to call)
  useEffect(() => {
    const data = assetsByOwnerRef.current
    if (resolvingLocations || data.length === 0) return

    const itemIdToAsset = new Map<number, ESIAsset>()
    for (const { assets } of data) {
      for (const asset of assets) {
        itemIdToAsset.set(asset.item_id, asset)
      }
    }

    const getRootInfo = (asset: ESIAsset): { structureId: number | null; locationId: number } => {
      let current = asset
      while (current.location_type === 'item') {
        const parent = itemIdToAsset.get(current.location_id)
        if (!parent) break
        current = parent
      }
      if (current.location_id > 1_000_000_000_000) {
        return { structureId: current.location_id, locationId: current.location_id }
      }
      return { structureId: null, locationId: current.location_id }
    }

    const unknownLocationIds = new Set<number>()
    for (const { assets } of data) {
      for (const asset of assets) {
        const root = getRootInfo(asset)
        if (root.structureId) {
          const structure = getStructure(root.structureId)
          if (structure?.solarSystemId && !hasLocation(structure.solarSystemId)) {
            unknownLocationIds.add(structure.solarSystemId)
          }
        } else if (!hasLocation(root.locationId)) {
          unknownLocationIds.add(root.locationId)
        }
      }
    }
    if (unknownLocationIds.size === 0) return

    resolvingLocations = true

    resolveLocations(Array.from(unknownLocationIds))
      .catch(() => {})
      .finally(() => {
        resolvingLocations = false
      })
  }, [assetDataKey, cacheVersion])

  // Abyssal prices (Mutamarket - ok to call)
  const [isRefreshingAbyssals, setIsRefreshingAbyssals] = useState(false)
  const refreshAbyssalPricesRef = useRef<(() => Promise<void>) | undefined>(undefined)

  refreshAbyssalPricesRef.current = async () => {
    if (isRefreshingAbyssals || assetsByOwner.length === 0) return

    const abyssalItemIds: number[] = []
    for (const { assets } of assetsByOwner) {
      for (const asset of assets) {
        if (isAbyssalTypeId(asset.type_id) && !hasCachedAbyssalPrice(asset.item_id)) {
          abyssalItemIds.push(asset.item_id)
        }
      }
    }
    if (abyssalItemIds.length === 0) return

    setIsRefreshingAbyssals(true)
    try {
      const fetched = await fetchAbyssalPrices(abyssalItemIds)
      if (fetched.size > 0) {
        setCacheVersion((v) => v + 1)
      }
    } catch {
      // Ignore
    } finally {
      setIsRefreshingAbyssals(false)
    }
  }

  const refreshAbyssalPrices = async () => {
    await refreshAbyssalPricesRef.current?.()
  }

  const hasData = assetsByOwner.length > 0

  return {
    assetsByOwner,
    owners,
    isLoading: isUpdating,
    hasData,
    hasError: !!updateError,
    errorMessage: updateError,
    prices,
    assetNames,
    cacheVersion,
    isRefreshingAbyssals,
    refreshAbyssalPrices,
    update,
    updateProgress,
    canUpdate,
    timeUntilUpdate,
  }
}
