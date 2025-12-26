import { useMemo } from 'react'
import { useAssetStore } from '@/store/asset-store'
import { usePriceStore } from '@/store/price-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useContractsStore } from '@/store/contracts-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useWalletStore } from '@/store/wallet-store'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { CategoryIds } from '@/lib/tree-types'
import { calculateStructureValues } from '@/lib/structure-constants'

export interface AssetTotals {
  total: number
  assetsTotal: number
  marketTotal: number
  industryTotal: number
  contractsTotal: number
  walletTotal: number
  structuresTotal: number
}

export function useTotalAssets(): AssetTotals {
  const assetsByOwner = useAssetStore((s) => s.assetsByOwner)
  const priceVersion = usePriceStore((s) => s.priceVersion)
  const types = useReferenceCacheStore((s) => s.types)
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)

  const ordersById = useMarketOrdersStore((s) => s.itemsById)
  const ordersVisibility = useMarketOrdersStore((s) => s.visibilityByOwner)
  const contractsById = useContractsStore((s) => s.itemsById)
  const contractsVisibility = useContractsStore((s) => s.visibilityByOwner)
  const itemsByContractId = useContractsStore((s) => s.itemsByContractId)
  const jobsById = useIndustryJobsStore((s) => s.itemsById)
  const jobsVisibility = useIndustryJobsStore((s) => s.visibilityByOwner)
  const walletsByOwner = useWalletStore((s) => s.dataByOwner)

  return useMemo(() => {
    void priceVersion

    const selectedSet = new Set(selectedOwnerIds)
    const matchesOwner = (type: 'character' | 'corporation', id: number) =>
      selectedSet.has(ownerKey(type, id))

    const { structureRelatedIds, structuresTotal } = calculateStructureValues(
      assetsByOwner,
      selectedOwnerIds
    )

    const priceStore = usePriceStore.getState()
    let assetsTotal = 0
    for (const { owner, assets } of assetsByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const asset of assets) {
        if (structureRelatedIds.has(asset.item_id)) continue
        if (asset.location_flag === 'SellOrder') continue

        const type = types.get(asset.type_id)
        if (
          type?.categoryId === CategoryIds.OWNER ||
          type?.categoryId === CategoryIds.STATION
        )
          continue

        const price = priceStore.getItemPrice(asset.type_id, {
          itemId: asset.item_id,
          isBlueprintCopy: asset.is_blueprint_copy,
        })
        assetsTotal += price * asset.quantity
      }
    }

    const marketTotal = useMarketOrdersStore.getTotal(selectedOwnerIds, {
      itemsById: ordersById,
      visibilityByOwner: ordersVisibility,
    })
    const contractsTotal = useContractsStore.getTotal(selectedOwnerIds, {
      itemsById: contractsById,
      visibilityByOwner: contractsVisibility,
      itemsByContractId,
    })
    const industryTotal = useIndustryJobsStore.getTotal(selectedOwnerIds, {
      itemsById: jobsById,
      visibilityByOwner: jobsVisibility,
    })

    let walletTotal = 0
    for (const wallet of walletsByOwner) {
      if (!matchesOwner(wallet.owner.type, wallet.owner.id)) continue
      if ('divisions' in wallet) {
        for (const div of wallet.divisions) {
          walletTotal += div.balance
        }
      } else {
        walletTotal += wallet.balance
      }
    }

    const total =
      assetsTotal +
      marketTotal +
      industryTotal +
      contractsTotal +
      walletTotal +
      structuresTotal

    return {
      total,
      assetsTotal,
      marketTotal,
      industryTotal,
      contractsTotal,
      walletTotal,
      structuresTotal,
    }
  }, [
    assetsByOwner,
    priceVersion,
    types,
    selectedOwnerIds,
    ordersById,
    ordersVisibility,
    contractsById,
    contractsVisibility,
    itemsByContractId,
    jobsById,
    jobsVisibility,
    walletsByOwner,
  ])
}
