import { useMemo } from 'react'
import { useAssetStore } from '@/store/asset-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useContractsStore } from '@/store/contracts-store'
import { useWalletStore } from '@/store/wallet-store'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { isAbyssalTypeId, getCachedAbyssalPrice } from '@/api/mutamarket-client'
import { getType } from '@/store/reference-cache'
import { CategoryIds } from '@/lib/tree-types'

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
  const contractsByOwner = useContractsStore((s) => s.contractsByOwner)
  const walletsByOwner = useWalletStore((s) => s.dataByOwner)
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  return useMemo(() => {
    const matchesOwner = (type: 'character' | 'corporation', id: number) =>
      selectedSet.has(ownerKey(type, id))

    let assetsTotal = 0
    let contractsTotal = 0
    let sellOrdersTotal = 0
    let industryTotal = 0
    let structuresTotal = 0

    for (const { owner, assets } of unifiedAssetsByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const asset of assets) {
        const type = getType(asset.type_id)
        if (type?.categoryId === CategoryIds.OWNER || type?.categoryId === CategoryIds.STATION) continue
        if (asset.is_blueprint_copy) continue

        const abyssalPrice = isAbyssalTypeId(asset.type_id)
          ? getCachedAbyssalPrice(asset.item_id)
          : undefined
        const price = abyssalPrice ?? prices.get(asset.type_id) ?? 0
        const value = price * asset.quantity

        switch (asset.location_flag) {
          case 'SellOrder':
            sellOrdersTotal += value
            break
          case 'InContract':
            contractsTotal += value
            break
          case 'IndustryJob':
            industryTotal += value
            break
          case 'Structure':
            structuresTotal += value
            break
          default:
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

    let collateralTotal = 0
    for (const { owner, contracts } of contractsByOwner) {
      if (!matchesOwner(owner.type, owner.id)) continue
      for (const { contract } of contracts) {
        if (contract.status === 'outstanding' || contract.status === 'in_progress') {
          collateralTotal += contract.collateral ?? 0
        }
      }
    }

    const marketTotal = sellOrdersTotal + buyEscrowTotal
    contractsTotal += collateralTotal

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
  }, [unifiedAssetsByOwner, prices, ordersByOwner, contractsByOwner, walletsByOwner, selectedSet])
}
