import { useMemo } from 'react'
import { useAssetStore } from '@/store/asset-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useContractsStore } from '@/store/contracts-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useWalletStore } from '@/store/wallet-store'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { isAbyssalTypeId, getCachedAbyssalPrice } from '@/api/mutamarket-client'
import { getType } from '@/store/reference-cache'
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
  const prices = useAssetStore((s) => s.prices)
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)

  const ordersUpdateCounter = useMarketOrdersStore((s) => s.updateCounter)
  const contractsUpdateCounter = useContractsStore((s) => s.updateCounter)
  const jobsUpdateCounter = useIndustryJobsStore((s) => s.updateCounter)
  const walletsByOwner = useWalletStore((s) => s.dataByOwner)

  return useMemo(() => {
    const selectedSet = new Set(selectedOwnerIds)
    const matchesOwner = (type: 'character' | 'corporation', id: number) =>
      selectedSet.has(ownerKey(type, id))

    const { structureRelatedIds, structuresTotal } = calculateStructureValues(
      assetsByOwner,
      prices,
      selectedOwnerIds
    )

    let assetsTotal = 0
    for (const { owner, assets } of assetsByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const asset of assets) {
        if (structureRelatedIds.has(asset.item_id)) continue
        if (asset.location_flag === 'SellOrder') continue

        const type = getType(asset.type_id)
        if (type?.categoryId === CategoryIds.OWNER || type?.categoryId === CategoryIds.STATION) continue
        if (asset.is_blueprint_copy) continue

        const abyssalPrice = isAbyssalTypeId(asset.type_id)
          ? getCachedAbyssalPrice(asset.item_id)
          : undefined
        const price = abyssalPrice ?? prices.get(asset.type_id) ?? 0
        assetsTotal += price * asset.quantity
      }
    }

    const marketTotal = useMarketOrdersStore.getTotal(selectedOwnerIds)
    const contractsTotal = useContractsStore.getState().getTotal(prices, selectedOwnerIds)
    const industryTotal = useIndustryJobsStore.getState().getTotal(prices, selectedOwnerIds)

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

    const total = assetsTotal + marketTotal + industryTotal + contractsTotal + walletTotal + structuresTotal

    return {
      total,
      assetsTotal,
      marketTotal,
      industryTotal,
      contractsTotal,
      walletTotal,
      structuresTotal,
    }
  }, [assetsByOwner, prices, selectedOwnerIds, ordersUpdateCounter, contractsUpdateCounter, jobsUpdateCounter, walletsByOwner])
}
