import { useMemo } from 'react'
import { useAssetStore } from '@/store/asset-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useWalletStore } from '@/store/wallet-store'
import { useStructuresStore } from '@/store/structures-store'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { isAbyssalTypeId, getCachedAbyssalPrice } from '@/api/mutamarket-client'

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
  const unifiedAssetsByOwner = useAssetStore((s) => s.unifiedAssetsByOwner)
  const prices = useAssetStore((s) => s.prices)
  const ordersByOwner = useMarketOrdersStore((s) => s.dataByOwner)
  const jobsByOwner = useIndustryJobsStore((s) => s.dataByOwner)
  const walletsByOwner = useWalletStore((s) => s.dataByOwner)
  const structuresByOwner = useStructuresStore((s) => s.dataByOwner)
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  return useMemo(() => {
    const matchesOwner = (type: 'character' | 'corporation', id: number) =>
      selectedSet.has(ownerKey(type, id))

    let assetsTotal = 0
    let contractsTotal = 0
    let sellOrdersTotal = 0

    for (const { owner, assets } of unifiedAssetsByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const asset of assets) {
        if (asset.location_flag === 'AutoFit') continue
        if (asset.is_blueprint_copy) continue

        const abyssalPrice = isAbyssalTypeId(asset.type_id)
          ? getCachedAbyssalPrice(asset.item_id)
          : undefined
        const price = abyssalPrice ?? prices.get(asset.type_id) ?? 0
        const value = price * asset.quantity

        if (asset.location_flag === 'SellOrder') {
          sellOrdersTotal += value
        } else if (asset.location_flag === 'InContract') {
          contractsTotal += value
        } else {
          assetsTotal += value
        }
      }
    }

    let buyEscrowTotal = 0
    for (const { owner, orders } of ordersByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const order of orders) {
        if (order.is_buy_order) {
          buyEscrowTotal += order.escrow ?? 0
        }
      }
    }

    const marketTotal = sellOrdersTotal + buyEscrowTotal

    let industryTotal = 0
    for (const { owner, jobs } of jobsByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const job of jobs) {
        if (job.status !== 'active' && job.status !== 'ready') continue
        const productTypeId = job.product_type_id ?? job.blueprint_type_id
        const price = prices.get(productTypeId) ?? 0
        industryTotal += price * job.runs
      }
    }

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

    let structuresTotal = 0
    for (const { owner, structures } of structuresByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const structure of structures) {
        const price = prices.get(structure.type_id) ?? 0
        structuresTotal += price
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
  }, [unifiedAssetsByOwner, prices, ordersByOwner, jobsByOwner, walletsByOwner, structuresByOwner, selectedSet])
}
