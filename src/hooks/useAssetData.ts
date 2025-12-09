import { useMemo, useState, useEffect, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useAuthStore, type Owner } from '@/store/auth-store'
import { getCharacterAssets, getAssetNames, type ESIAsset } from '@/api/endpoints/assets'
import { getCorporationAssets } from '@/api/endpoints/corporation'
import { fetchPrices } from '@/api/ref-client'
import { fetchAbyssalPrices, isAbyssalTypeId, hasCachedAbyssalPrice } from '@/api/mutamarket-client'
import {
  hasType,
  hasStructure,
  hasLocation,
  getStructure,
  subscribe as subscribeToCache,
} from '@/store/reference-cache'
import { resolveStructures, resolveLocationNames, resolveTypes } from '@/api/endpoints/universe'

export interface OwnerAssets {
  owner: Owner
  assets: ESIAsset[]
}

export interface AssetDataResult {
  assetsByOwner: OwnerAssets[]
  owners: Owner[]
  isLoading: boolean
  isFetching: boolean
  hasError: boolean
  firstError: Error | null
  typeProgress: { resolved: number; total: number } | null
  prices: Map<number, number>
  assetNames: Map<number, string>
  cacheVersion: number
  isRefreshingAbyssals: boolean
  refreshAbyssalPrices: () => Promise<void>
}

async function fetchOwnerAssets(owner: Owner): Promise<OwnerAssets> {
  let assets: ESIAsset[]
  if (owner.type === 'corporation') {
    assets = await getCorporationAssets(owner.id, owner.characterId)
  } else {
    assets = await getCharacterAssets(owner.id)
  }
  return { owner, assets }
}

export function useAssetData(): AssetDataResult {
  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => {
    return subscribeToCache(() => setCacheVersion((v) => v + 1))
  }, [])

  const assetQueryConfigs = useMemo(
    () =>
      owners.map((owner) => ({
        queryKey: ['assets', owner.type, owner.id] as const,
        queryFn: () => fetchOwnerAssets(owner),
        enabled: !!(owner.accessToken || owner.refreshToken),
        staleTime: 5 * 60 * 1000,
      })),
    [owners]
  )

  const assetQueries = useQueries({ queries: assetQueryConfigs })

  const assetDataVersion = assetQueries.map((q) => q.dataUpdatedAt).join(',')
  const assetQueriesRef = useRef(assetQueries)
  assetQueriesRef.current = assetQueries

  const assetsByOwner = useMemo(() => {
    void assetDataVersion
    return assetQueriesRef.current.filter((q) => q.data).map((q) => q.data!)
  }, [assetDataVersion])

  const assetDataKey = assetsByOwner
    .map((d) => `${d.owner.type}-${d.owner.id}`)
    .sort()
    .join(',')

  const ownersKey = owners
    .map((o) => `${o.type}-${o.id}`)
    .sort()
    .join(',')

  const assetsByOwnerRef = useRef(assetsByOwner)
  assetsByOwnerRef.current = assetsByOwner

  const ownersRef = useRef(owners)
  ownersRef.current = owners

  // Prices
  const [prices, setPrices] = useState<Map<number, number>>(new Map())
  useEffect(() => {
    const data = assetsByOwnerRef.current
    if (data.length === 0) return

    const typeIds = new Set<number>()
    for (const { assets } of data) {
      for (const asset of assets) {
        typeIds.add(asset.type_id)
      }
    }
    if (typeIds.size === 0) return

    fetchPrices(Array.from(typeIds)).then(setPrices)
  }, [assetDataKey])

  // Type resolution
  const [typeProgress, setTypeProgress] = useState<{ resolved: number; total: number } | null>(null)
  const resolvingTypesRef = useRef(false)

  useEffect(() => {
    const data = assetsByOwnerRef.current
    if (resolvingTypesRef.current || data.length === 0) return

    const unknownTypeIds = new Set<number>()
    for (const { assets } of data) {
      for (const asset of assets) {
        if (!hasType(asset.type_id)) {
          unknownTypeIds.add(asset.type_id)
        }
      }
    }
    if (unknownTypeIds.size === 0) return

    resolvingTypesRef.current = true
    setTypeProgress({ resolved: 0, total: unknownTypeIds.size })

    resolveTypes(Array.from(unknownTypeIds), 20, (resolved, total) =>
      setTypeProgress({ resolved, total })
    )
      .then(() => setTypeProgress(null))
      .catch(() => setTypeProgress(null))
      .finally(() => {
        resolvingTypesRef.current = false
      })
  }, [assetDataKey])

  // Structure resolution
  const resolvingStructuresRef = useRef(false)

  useEffect(() => {
    const data = assetsByOwnerRef.current
    const currentOwners = ownersRef.current
    if (resolvingStructuresRef.current || data.length === 0) return

    const itemIdToAsset = new Map<number, ESIAsset>()
    for (const { assets } of data) {
      for (const asset of assets) {
        itemIdToAsset.set(asset.item_id, asset)
      }
    }

    const getRootStructureId = (asset: ESIAsset): number | null => {
      let current = asset
      while (current.location_type === 'item') {
        const parent = itemIdToAsset.get(current.location_id)
        if (!parent) break
        current = parent
      }
      if (current.item_id > 1_000_000_000_000) return current.item_id
      if (current.location_id > 1_000_000_000_000) return current.location_id
      return null
    }

    const unknownStructureIds = new Set<number>()
    for (const { assets } of data) {
      for (const asset of assets) {
        const structureId = getRootStructureId(asset)
        if (structureId && !hasStructure(structureId)) {
          unknownStructureIds.add(structureId)
        }
      }
    }
    if (unknownStructureIds.size === 0) return

    const characterIds = currentOwners
      .map((o) => o.characterId)
      .filter((id, idx, arr) => arr.indexOf(id) === idx)

    resolvingStructuresRef.current = true

    resolveStructures(Array.from(unknownStructureIds), characterIds)
      .catch(() => {})
      .finally(() => {
        resolvingStructuresRef.current = false
      })
  }, [assetDataKey, ownersKey])

  // Location resolution
  const resolvingLocationsRef = useRef(false)

  useEffect(() => {
    const data = assetsByOwnerRef.current
    if (resolvingLocationsRef.current || data.length === 0) return

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
      if (current.item_id > 1_000_000_000_000) {
        return { structureId: current.item_id, locationId: current.location_id }
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

    resolvingLocationsRef.current = true

    resolveLocationNames(Array.from(unknownLocationIds))
      .catch(() => {})
      .finally(() => {
        resolvingLocationsRef.current = false
      })
  }, [assetDataKey, cacheVersion])

  const nameQueryConfigs = useMemo(() => {
    return assetsByOwner
      .filter((data) => data.owner.type === 'character')
      .flatMap((data) => {
        const singletonIds = data.assets.filter((a) => a.is_singleton).map((a) => a.item_id)
        if (singletonIds.length === 0) return []
        return [
          {
            queryKey: ['assetNames', data.owner.id, singletonIds.length] as const,
            queryFn: () => getAssetNames(data.owner.id, singletonIds),
            enabled: singletonIds.length > 0,
            staleTime: 5 * 60 * 1000,
          },
        ]
      })
  }, [assetsByOwner])

  const nameQueries = useQueries({ queries: nameQueryConfigs })

  const nameQueriesVersion = nameQueries.map((q) => q.dataUpdatedAt).join(',')
  const nameQueriesRef = useRef(nameQueries)
  nameQueriesRef.current = nameQueries

  const assetNames = useMemo(() => {
    void nameQueriesVersion
    const map = new Map<number, string>()
    for (const query of nameQueriesRef.current) {
      if (query.data) {
        for (const n of query.data) {
          if (n.name && n.name !== 'None') {
            map.set(n.item_id, n.name)
          }
        }
      }
    }
    return map
  }, [nameQueriesVersion])

  const [isRefreshingAbyssals, setIsRefreshingAbyssals] = useState(false)
  const refreshAbyssalPricesRef = useRef<() => Promise<void>>()

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

  useEffect(() => {
    const handler = () => {
      refreshAbyssalPricesRef.current?.()
    }
    window.addEventListener('refreshAbyssalPrices', handler)
    return () => window.removeEventListener('refreshAbyssalPrices', handler)
  }, [])

  const isLoading = assetQueries.some((q) => q.isLoading)
  const isFetching = assetQueries.some((q) => q.isFetching)
  const hasError = assetQueries.some((q) => q.error)
  const firstError = assetQueries.find((q) => q.error)?.error ?? null

  return {
    assetsByOwner,
    owners,
    isLoading,
    isFetching,
    hasError,
    firstError,
    typeProgress,
    prices,
    assetNames,
    cacheVersion,
    isRefreshingAbyssals,
    refreshAbyssalPrices,
  }
}
