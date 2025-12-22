import type { OwnerAssets } from './asset-store'
import type { OwnerContracts } from './contracts-store'
import type { OwnerOrders } from './market-orders-store'
import type { OwnerJobs } from './industry-jobs-store'
import type { OwnerStructures } from './structures-store'

export function collectAllTypeIds(
  assetsByOwner: OwnerAssets[],
  ordersByOwner: OwnerOrders[],
  contractsByOwner: OwnerContracts[],
  jobsByOwner: OwnerJobs[],
  structuresByOwner: OwnerStructures[]
): Set<number> {
  const typeIds = new Set<number>()

  for (const { assets } of assetsByOwner) {
    for (const asset of assets) {
      typeIds.add(asset.type_id)
    }
  }

  for (const { orders } of ordersByOwner) {
    for (const order of orders) {
      typeIds.add(order.type_id)
    }
  }

  for (const { contracts } of contractsByOwner) {
    for (const { items } of contracts) {
      if (items) {
        for (const item of items) {
          typeIds.add(item.type_id)
        }
      }
    }
  }

  for (const { jobs } of jobsByOwner) {
    for (const job of jobs) {
      if (job.product_type_id) {
        typeIds.add(job.product_type_id)
      }
    }
  }

  for (const { structures } of structuresByOwner) {
    for (const structure of structures) {
      typeIds.add(structure.type_id)
    }
  }

  return typeIds
}
