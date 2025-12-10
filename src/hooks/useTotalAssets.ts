import { useMemo } from 'react'
import { useAssetStore } from '@/store/asset-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useContractsStore } from '@/store/contracts-store'
import { useWalletStore } from '@/store/wallet-store'
import { useAuthStore } from '@/store/auth-store'
import { isAbyssalTypeId, getCachedAbyssalPrice } from '@/api/mutamarket-client'

export interface AssetTotals {
  total: number
  assetsTotal: number
  marketTotal: number
  industryTotal: number
  contractsTotal: number
  walletTotal: number
}

export function useTotalAssets(): AssetTotals {
  const assetsByOwner = useAssetStore((s) => s.assetsByOwner)
  const prices = useAssetStore((s) => s.prices)
  const ordersByOwner = useMarketOrdersStore((s) => s.ordersByOwner)
  const jobsByOwner = useIndustryJobsStore((s) => s.jobsByOwner)
  const contractsByOwner = useContractsStore((s) => s.contractsByOwner)
  const walletTotal = useWalletStore((s) => s.getTotalBalance)()
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  return useMemo(() => {
    let assetsTotal = 0
    for (const { assets } of assetsByOwner) {
      for (const asset of assets) {
        const abyssalPrice = isAbyssalTypeId(asset.type_id)
          ? getCachedAbyssalPrice(asset.item_id)
          : undefined
        const price = abyssalPrice ?? prices.get(asset.type_id) ?? 0
        assetsTotal += price * asset.quantity
      }
    }

    let marketTotal = 0
    for (const { orders } of ordersByOwner) {
      for (const order of orders) {
        marketTotal += order.is_buy_order ? (order.escrow ?? 0) : order.price * order.volume_remain
      }
    }

    let industryTotal = 0
    for (const { jobs } of jobsByOwner) {
      for (const job of jobs) {
        if (job.status !== 'active' && job.status !== 'ready') continue
        const productTypeId = job.product_type_id ?? job.blueprint_type_id
        const price = prices.get(productTypeId) ?? 0
        industryTotal += price * job.runs
      }
    }

    let contractsTotal = 0
    const ownerIds = new Set(owners.map((o) => o.characterId))
    const ownerCorpIds = new Set(owners.filter((o) => o.corporationId).map((o) => o.corporationId!))
    const seenContracts = new Set<number>()

    for (const { contracts } of contractsByOwner) {
      for (const { contract, items } of contracts) {
        if (seenContracts.has(contract.contract_id)) continue
        seenContracts.add(contract.contract_id)
        if (contract.status !== 'outstanding' && contract.status !== 'in_progress') continue
        if (contract.type === 'courier') continue

        const isIssuer = ownerIds.has(contract.issuer_id)
        const isAssignee = ownerIds.has(contract.assignee_id) || ownerCorpIds.has(contract.assignee_id)

        let itemValue = 0
        for (const item of items) {
          if (!item.is_included) continue
          let itemPrice: number
          if (isAbyssalTypeId(item.type_id) && item.item_id) {
            itemPrice = getCachedAbyssalPrice(item.item_id) ?? 0
          } else {
            itemPrice = prices.get(item.type_id) ?? 0
          }
          itemValue += itemPrice * item.quantity
        }

        const contractPrice = contract.price ?? 0
        if (isIssuer && !isAssignee) {
          contractsTotal += contractPrice - itemValue
        } else if (isAssignee && !isIssuer) {
          contractsTotal += itemValue - contractPrice
        }
      }
    }

    const total = assetsTotal + marketTotal + industryTotal + contractsTotal + walletTotal

    return {
      total,
      assetsTotal,
      marketTotal,
      industryTotal,
      contractsTotal,
      walletTotal,
    }
  }, [assetsByOwner, prices, ordersByOwner, jobsByOwner, contractsByOwner, walletTotal, owners])
}
