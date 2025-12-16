import { type OwnerAssets } from '@/store/asset-store'
import { type OwnerContracts } from '@/store/contracts-store'
import { type OwnerOrders } from '@/store/market-orders-store'
import { type OwnerJobs } from '@/store/industry-jobs-store'
import { type OwnerStructures } from '@/store/structures-store'
import { type CharacterCloneData } from '@/store/clones-store'
import { type ESIAsset } from '@/api/endpoints/assets'
import { type Owner } from '@/store/auth-store'
import {
  hasType,
  getType,
  hasLocation,
  hasStructure,
  getStructure,
} from '@/store/reference-cache'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import { resolveStructures, resolveNames } from '@/api/endpoints/universe'
import { isAbyssalTypeId, fetchAbyssalPrices, hasCachedAbyssalPrice } from '@/api/mutamarket-client'
import { logger } from './logger'

export interface ResolutionIds {
  typeIds: Set<number>
  locationIds: Set<number>
  structureToCharacter: Map<number, number>
  entityIds: Set<number>
  abyssalItemIds: number[]
}

function needsTypeResolution(typeId: number): boolean {
  return !hasType(typeId)
}

function collectFromAssets(
  assetsByOwner: OwnerAssets[],
  ids: ResolutionIds
): void {
  const itemIdToAsset = new Map<number, ESIAsset>()
  const itemIdToOwner = new Map<number, Owner>()

  for (const { owner, assets } of assetsByOwner) {
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
    if (current.location_id > 1_000_000_000_000) {
      return { structureId: current.location_id, owner }
    }
    return { structureId: null, owner }
  }

  for (const { owner, assets } of assetsByOwner) {
    for (const asset of assets) {
      if (needsTypeResolution(asset.type_id)) {
        ids.typeIds.add(asset.type_id)
      }

      if (isAbyssalTypeId(asset.type_id) && !hasCachedAbyssalPrice(asset.item_id)) {
        ids.abyssalItemIds.push(asset.item_id)
      }

      const type = hasType(asset.type_id) ? getType(asset.type_id) : undefined
      if (type?.categoryId === 65 && asset.location_type === 'solar_system' && !hasStructure(asset.item_id)) {
        ids.structureToCharacter.set(asset.item_id, owner.characterId)
      }

      const { structureId, owner: rootOwner } = getRootInfo(asset)
      if (structureId && !hasStructure(structureId) && rootOwner) {
        ids.structureToCharacter.set(structureId, rootOwner.characterId)
      }
    }
  }
}

function collectFromContracts(
  contractsByOwner: OwnerContracts[],
  ids: ResolutionIds
): void {
  const checkLocation = (locationId: number | undefined, characterId: number) => {
    if (!locationId) return
    if (locationId > 1_000_000_000_000) {
      if (!hasStructure(locationId)) {
        ids.structureToCharacter.set(locationId, characterId)
      }
    } else if (!hasLocation(locationId)) {
      ids.locationIds.add(locationId)
    }
  }

  for (const { owner, contracts } of contractsByOwner) {
    for (const { contract, items } of contracts) {
      checkLocation(contract.start_location_id, owner.characterId)
      checkLocation(contract.end_location_id, owner.characterId)

      if (contract.assignee_id) {
        ids.entityIds.add(contract.assignee_id)
      }

      for (const item of items) {
        if (needsTypeResolution(item.type_id)) {
          ids.typeIds.add(item.type_id)
        }
        if (item.item_id && isAbyssalTypeId(item.type_id) && !hasCachedAbyssalPrice(item.item_id)) {
          ids.abyssalItemIds.push(item.item_id)
        }
      }
    }
  }
}

function collectFromOrders(
  ordersByOwner: OwnerOrders[],
  ids: ResolutionIds
): void {
  for (const { owner, orders } of ordersByOwner) {
    for (const order of orders) {
      if (needsTypeResolution(order.type_id)) {
        ids.typeIds.add(order.type_id)
      }
      if (order.location_id > 1_000_000_000_000) {
        if (!hasStructure(order.location_id)) {
          ids.structureToCharacter.set(order.location_id, owner.characterId)
        }
      } else if (!hasLocation(order.location_id)) {
        ids.locationIds.add(order.location_id)
      }
    }
  }
}

function collectFromJobs(
  jobsByOwner: OwnerJobs[],
  ids: ResolutionIds
): void {
  for (const { owner, jobs } of jobsByOwner) {
    for (const job of jobs) {
      if (needsTypeResolution(job.blueprint_type_id)) {
        ids.typeIds.add(job.blueprint_type_id)
      }
      if (job.product_type_id && needsTypeResolution(job.product_type_id)) {
        ids.typeIds.add(job.product_type_id)
      }

      const locationId = job.location_id ?? job.facility_id
      if (locationId > 1_000_000_000_000) {
        if (!hasStructure(locationId)) {
          ids.structureToCharacter.set(locationId, owner.characterId)
        }
      } else if (!hasLocation(locationId)) {
        ids.locationIds.add(locationId)
      }
    }
  }
}

function collectFromStructures(
  structuresByOwner: OwnerStructures[],
  ids: ResolutionIds
): void {
  for (const { structures } of structuresByOwner) {
    for (const structure of structures) {
      if (needsTypeResolution(structure.type_id)) {
        ids.typeIds.add(structure.type_id)
      }
      if (!hasLocation(structure.system_id)) {
        ids.locationIds.add(structure.system_id)
      }
    }
  }
}

function collectFromClones(
  clonesByOwner: CharacterCloneData[],
  ids: ResolutionIds
): void {
  for (const { owner, clones, activeImplants } of clonesByOwner) {
    for (const implantId of activeImplants) {
      if (needsTypeResolution(implantId)) {
        ids.typeIds.add(implantId)
      }
    }

    if (clones.home_location) {
      const { location_id, location_type } = clones.home_location
      if (location_type === 'structure') {
        if (!hasStructure(location_id)) {
          ids.structureToCharacter.set(location_id, owner.characterId)
        }
      } else if (!hasLocation(location_id)) {
        ids.locationIds.add(location_id)
      }
    }

    for (const jumpClone of clones.jump_clones) {
      const { location_id, location_type } = jumpClone
      if (location_type === 'structure') {
        if (!hasStructure(location_id)) {
          ids.structureToCharacter.set(location_id, owner.characterId)
        }
      } else if (!hasLocation(location_id)) {
        ids.locationIds.add(location_id)
      }

      for (const implantId of jumpClone.implants) {
        if (needsTypeResolution(implantId)) {
          ids.typeIds.add(implantId)
        }
      }
    }
  }
}

export function collectResolutionIds(
  assetsByOwner: OwnerAssets[],
  contractsByOwner: OwnerContracts[],
  ordersByOwner: OwnerOrders[],
  jobsByOwner: OwnerJobs[],
  structuresByOwner: OwnerStructures[],
  clonesByOwner: CharacterCloneData[]
): ResolutionIds {
  const ids: ResolutionIds = {
    typeIds: new Set(),
    locationIds: new Set(),
    structureToCharacter: new Map(),
    entityIds: new Set(),
    abyssalItemIds: [],
  }

  collectFromAssets(assetsByOwner, ids)
  collectFromContracts(contractsByOwner, ids)
  collectFromOrders(ordersByOwner, ids)
  collectFromJobs(jobsByOwner, ids)
  collectFromStructures(structuresByOwner, ids)
  collectFromClones(clonesByOwner, ids)

  return ids
}

export async function resolveAllReferenceData(ids: ResolutionIds): Promise<void> {
  const hasWork =
    ids.typeIds.size > 0 ||
    ids.structureToCharacter.size > 0 ||
    ids.locationIds.size > 0 ||
    ids.entityIds.size > 0 ||
    ids.abyssalItemIds.length > 0

  if (!hasWork) return

  logger.info('Resolving reference data', {
    module: 'DataResolver',
    types: ids.typeIds.size,
    structures: ids.structureToCharacter.size,
    locations: ids.locationIds.size,
    entities: ids.entityIds.size,
    abyssals: ids.abyssalItemIds.length,
  })

  if (ids.typeIds.size > 0) {
    await resolveTypes(Array.from(ids.typeIds)).catch(() => {})
  }

  if (ids.structureToCharacter.size > 0) {
    await resolveStructures(ids.structureToCharacter).catch(() => {})
  }

  for (const [structureId] of ids.structureToCharacter) {
    const structure = getStructure(structureId)
    if (structure?.solarSystemId && !hasLocation(structure.solarSystemId)) {
      ids.locationIds.add(structure.solarSystemId)
    }
  }

  if (ids.locationIds.size > 0) {
    await resolveLocations(Array.from(ids.locationIds)).catch(() => {})
  }

  if (ids.entityIds.size > 0) {
    await resolveNames(Array.from(ids.entityIds)).catch(() => {})
  }

  if (ids.abyssalItemIds.length > 0) {
    await fetchAbyssalPrices(ids.abyssalItemIds).catch(() => {})
  }

  logger.info('Reference data resolution complete', { module: 'DataResolver' })
}

let resolutionPending = false
let resolutionQueued = false
let resolutionTimeout: ReturnType<typeof setTimeout> | null = null

async function runResolution(): Promise<void> {
  const { useAssetStore } = await import('@/store/asset-store')
  const { useContractsStore } = await import('@/store/contracts-store')
  const { useMarketOrdersStore } = await import('@/store/market-orders-store')
  const { useIndustryJobsStore } = await import('@/store/industry-jobs-store')
  const { useStructuresStore } = await import('@/store/structures-store')
  const { useClonesStore } = await import('@/store/clones-store')

  const ids = collectResolutionIds(
    useAssetStore.getState().assetsByOwner,
    useContractsStore.getState().contractsByOwner,
    useMarketOrdersStore.getState().dataByOwner,
    useIndustryJobsStore.getState().dataByOwner,
    useStructuresStore.getState().dataByOwner,
    useClonesStore.getState().dataByOwner
  )

  await resolveAllReferenceData(ids)
}

export async function triggerResolution(): Promise<void> {
  if (resolutionPending) {
    resolutionQueued = true
    return
  }

  if (resolutionTimeout) {
    clearTimeout(resolutionTimeout)
  }

  resolutionTimeout = setTimeout(async () => {
    resolutionPending = true
    resolutionTimeout = null
    try {
      await runResolution()
      while (resolutionQueued) {
        resolutionQueued = false
        await runResolution()
      }
    } finally {
      resolutionPending = false
    }
  }, 50)
}
