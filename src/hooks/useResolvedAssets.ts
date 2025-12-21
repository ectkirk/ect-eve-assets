import { useMemo } from 'react'
import { useAssetData, type OwnerAssets } from './useAssetData'
import { useAuthStore, ownerKey, findOwnerByKey } from '@/store/auth-store'
import {
  resolveAllAssets,
  resolveMarketOrder,
  resolveContractItem,
} from '@/lib/asset-resolver'
import type { ResolvedAsset, ResolvedAssetsByOwner } from '@/lib/resolved-asset'
import { useStarbasesStore } from '@/store/starbases-store'
import { useStructuresStore } from '@/store/structures-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useContractsStore } from '@/store/contracts-store'

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
  const ordersById = useMarketOrdersStore((s) => s.itemsById)
  const ordersVisibilityByOwner = useMarketOrdersStore(
    (s) => s.visibilityByOwner
  )
  const ordersUpdateCounter = useMarketOrdersStore((s) => s.updateCounter)
  const contractsById = useContractsStore((s) => s.itemsById)
  const contractItemsById = useContractsStore((s) => s.itemsByContractId)
  const contractsVisibilityByOwner = useContractsStore(
    (s) => s.visibilityByOwner
  )
  const contractsUpdateCounter = useContractsStore((s) => s.updateCounter)

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
    void ordersUpdateCounter
    void contractsUpdateCounter

    const assets =
      assetData.assetsByOwner.length > 0
        ? resolveAllAssets(assetData.assetsByOwner, {
            prices: assetData.prices,
            assetNames: assetData.assetNames,
            ownedStructureIds,
            starbaseMoonIds,
          })
        : []

    for (const [ownerKeyStr, orderIds] of ordersVisibilityByOwner) {
      const owner = findOwnerByKey(ownerKeyStr)
      if (!owner) continue

      for (const orderId of orderIds) {
        const stored = ordersById.get(orderId)
        if (stored && !stored.item.is_buy_order) {
          assets.push(resolveMarketOrder(stored.item, owner, assetData.prices))
        }
      }
    }

    for (const [ownerKeyStr, contractIds] of contractsVisibilityByOwner) {
      const owner = findOwnerByKey(ownerKeyStr)
      if (!owner) continue

      const isCharOwner = owner.type === 'character'
      const ownerId = isCharOwner ? owner.characterId : owner.id

      for (const contractId of contractIds) {
        const stored = contractsById.get(contractId)
        if (!stored) continue

        const contract = stored.item
        const items = contractItemsById.get(contractId)
        if (contract.status !== 'outstanding' || !items) continue

        const isIssuer = isCharOwner
          ? contract.issuer_id === ownerId
          : contract.issuer_corporation_id === ownerId

        if (!isIssuer) continue

        for (const item of items) {
          if (item.is_included) {
            assets.push(
              resolveContractItem(contract, item, owner, assetData.prices)
            )
          }
        }
      }
    }

    return assets
  }, [
    assetData.assetsByOwner,
    assetData.prices,
    assetData.assetNames,
    ownedStructureIds,
    starbaseMoonIds,
    ordersById,
    ordersVisibilityByOwner,
    ordersUpdateCounter,
    contractsById,
    contractItemsById,
    contractsVisibilityByOwner,
    contractsUpdateCounter,
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
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

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
