import { useMemo } from 'react'
import { useAssetStore } from '@/store/asset-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useContractsStore } from '@/store/contracts-store'
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
  const assetsByOwner = useAssetStore((s) => s.assetsByOwner)
  const prices = useAssetStore((s) => s.prices)
  const ordersByOwner = useMarketOrdersStore((s) => s.dataByOwner)
  const jobsByOwner = useIndustryJobsStore((s) => s.dataByOwner)
  const contractsByOwner = useContractsStore((s) => s.contractsByOwner)
  const contractsUpdateCounter = useContractsStore((s) => s.updateCounter)
  const walletsByOwner = useWalletStore((s) => s.dataByOwner)
  const structuresByOwner = useStructuresStore((s) => s.dataByOwner)
  const activeOwnerId = useAuthStore((s) => s.activeOwnerId)

  return useMemo(() => {
    const matchesOwner = (type: 'character' | 'corporation', id: number) =>
      activeOwnerId === null || ownerKey(type, id) === activeOwnerId

    let assetsTotal = 0
    for (const { owner, assets } of assetsByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const asset of assets) {
        if (asset.location_flag === 'AutoFit') continue
        if (asset.is_blueprint_copy) continue
        const abyssalPrice = isAbyssalTypeId(asset.type_id)
          ? getCachedAbyssalPrice(asset.item_id)
          : undefined
        const price = abyssalPrice ?? prices.get(asset.type_id) ?? 0
        assetsTotal += price * asset.quantity
      }
    }

    let marketTotal = 0
    for (const { owner, orders } of ordersByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const order of orders) {
        marketTotal += order.is_buy_order ? (order.escrow ?? 0) : order.price * order.volume_remain
      }
    }

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

    let contractsTotal = 0
    const seenContracts = new Set<number>()

    for (const { owner, contracts } of contractsByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const { contract, items } of contracts) {
        if (seenContracts.has(contract.contract_id)) continue
        seenContracts.add(contract.contract_id)
        if (contract.status !== 'outstanding' && contract.status !== 'in_progress') continue

        if (contract.type === 'courier') {
          contractsTotal += contract.collateral ?? 0
          continue
        }

        let itemValue = 0
        for (const item of items) {
          if (!item.is_included) continue
          if (item.is_blueprint_copy) continue
          let itemPrice: number
          if (isAbyssalTypeId(item.type_id) && item.item_id) {
            itemPrice = getCachedAbyssalPrice(item.item_id) ?? 0
          } else {
            itemPrice = prices.get(item.type_id) ?? 0
          }
          itemValue += itemPrice * item.quantity
        }

        contractsTotal += itemValue
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
  }, [assetsByOwner, prices, ordersByOwner, jobsByOwner, contractsByOwner, contractsUpdateCounter, walletsByOwner, structuresByOwner, activeOwnerId])
}
