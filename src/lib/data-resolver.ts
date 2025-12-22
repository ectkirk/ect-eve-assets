import { type OwnerAssets } from '@/store/asset-store'
import { type OwnerContracts } from '@/store/contracts-store'
import { type OwnerOrders } from '@/store/market-orders-store'
import { type OwnerJobs } from '@/store/industry-jobs-store'
import { type OwnerStructures } from '@/store/structures-store'
import { type OwnerStarbases } from '@/store/starbases-store'
import { type CharacterCloneData } from '@/store/clones-store'
import { type OwnerLoyalty } from '@/store/loyalty-store'
import { type ESIAsset } from '@/api/endpoints/assets'
import { type Owner } from '@/store/auth-store'
import {
  hasType,
  getType,
  hasLocation,
  getLocation,
  hasStructure,
  getStructure,
  saveStructures,
  saveTypes,
  notifyCacheListeners,
  type CachedStructure,
  type CachedType,
} from '@/store/reference-cache'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import {
  resolveStructures,
  resolveNames,
  hasName,
} from '@/api/endpoints/universe'
import { logger } from './logger'

export interface ResolutionIds {
  typeIds: Set<number>
  locationIds: Set<number>
  structureToCharacter: Map<number, number>
  entityIds: Set<number>
  implantIds: Set<number>
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

      if (
        asset.location_type !== 'item' &&
        asset.location_id <= 1_000_000_000_000 &&
        !hasLocation(asset.location_id)
      ) {
        ids.locationIds.add(asset.location_id)
      }

      const type = hasType(asset.type_id) ? getType(asset.type_id) : undefined
      if (
        type?.categoryId === 65 &&
        asset.location_type === 'solar_system' &&
        !hasStructure(asset.item_id)
      ) {
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
  const checkLocation = (
    locationId: number | undefined,
    characterId: number
  ) => {
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

      if (!hasName(contract.issuer_id)) {
        ids.entityIds.add(contract.issuer_id)
      }
      if (contract.assignee_id && !hasName(contract.assignee_id)) {
        ids.entityIds.add(contract.assignee_id)
      }

      if (items) {
        for (const item of items) {
          if (needsTypeResolution(item.type_id)) {
            ids.typeIds.add(item.type_id)
          }
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

function collectFromJobs(jobsByOwner: OwnerJobs[], ids: ResolutionIds): void {
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

function collectFromStarbases(
  starbasesByOwner: OwnerStarbases[],
  ids: ResolutionIds
): void {
  for (const { starbases } of starbasesByOwner) {
    for (const starbase of starbases) {
      if (needsTypeResolution(starbase.type_id)) {
        ids.typeIds.add(starbase.type_id)
      }
      if (!hasLocation(starbase.system_id)) {
        ids.locationIds.add(starbase.system_id)
      }
      if (starbase.moon_id && !hasLocation(starbase.moon_id)) {
        ids.locationIds.add(starbase.moon_id)
      }
    }
  }
}

function needsImplantSlot(typeId: number): boolean {
  const type = getType(typeId)
  return !type?.implantSlot
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
      if (needsImplantSlot(implantId)) {
        ids.implantIds.add(implantId)
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
        if (needsImplantSlot(implantId)) {
          ids.implantIds.add(implantId)
        }
      }
    }
  }
}

function collectFromLoyalty(
  loyaltyByOwner: OwnerLoyalty[],
  ids: ResolutionIds
): void {
  for (const { loyaltyPoints } of loyaltyByOwner) {
    for (const lp of loyaltyPoints) {
      if (!hasName(lp.corporation_id)) {
        ids.entityIds.add(lp.corporation_id)
      }
    }
  }
}

export async function collectResolutionIds(
  assetsByOwner: OwnerAssets[],
  contractsByOwner: OwnerContracts[],
  ordersByOwner: OwnerOrders[],
  jobsByOwner: OwnerJobs[],
  structuresByOwner: OwnerStructures[],
  starbasesByOwner: OwnerStarbases[],
  clonesByOwner: CharacterCloneData[],
  loyaltyByOwner: OwnerLoyalty[]
): Promise<ResolutionIds> {
  const ids: ResolutionIds = {
    typeIds: new Set(),
    locationIds: new Set(),
    structureToCharacter: new Map(),
    entityIds: new Set(),
    implantIds: new Set(),
  }

  collectFromAssets(assetsByOwner, ids)
  collectFromContracts(contractsByOwner, ids)
  collectFromOrders(ordersByOwner, ids)
  collectFromJobs(jobsByOwner, ids)
  collectFromStructures(structuresByOwner, ids)
  collectFromStarbases(starbasesByOwner, ids)
  collectFromClones(clonesByOwner, ids)
  collectFromLoyalty(loyaltyByOwner, ids)

  return ids
}

export async function resolveAllReferenceData(
  ids: ResolutionIds
): Promise<void> {
  const { useStarbasesStore } = await import('@/store/starbases-store')
  const starbasesByOwner = useStarbasesStore.getState().dataByOwner

  const starbaseIds = new Set<number>()
  const starbaseData = new Map<
    number,
    { moonId: number | undefined; systemId: number; typeId: number }
  >()
  for (const { starbases } of starbasesByOwner) {
    for (const starbase of starbases) {
      starbaseIds.add(starbase.starbase_id)
      starbaseData.set(starbase.starbase_id, {
        moonId: starbase.moon_id,
        systemId: starbase.system_id,
        typeId: starbase.type_id,
      })
    }
  }

  const upwellStructures = new Map<number, number>()
  for (const [structureId, characterId] of ids.structureToCharacter) {
    if (!starbaseIds.has(structureId)) {
      upwellStructures.set(structureId, characterId)
    }
  }

  const uncachedStarbases = Array.from(starbaseIds).filter(
    (id) => !hasStructure(id)
  )

  const hasWork =
    ids.typeIds.size > 0 ||
    upwellStructures.size > 0 ||
    ids.locationIds.size > 0 ||
    ids.entityIds.size > 0 ||
    ids.implantIds.size > 0 ||
    uncachedStarbases.length > 0

  if (!hasWork) return

  logger.info('Resolving reference data', {
    module: 'DataResolver',
    types: ids.typeIds.size,
    structures: upwellStructures.size,
    starbases: uncachedStarbases.length,
    locations: ids.locationIds.size,
    entities: ids.entityIds.size,
    implants: ids.implantIds.size,
  })

  const typesPromise =
    ids.typeIds.size > 0
      ? resolveTypes(Array.from(ids.typeIds)).catch(() => {})
      : Promise.resolve()

  const entitiesPromise =
    ids.entityIds.size > 0
      ? resolveNames(Array.from(ids.entityIds)).catch(() => {})
      : Promise.resolve()

  if (upwellStructures.size > 0) {
    await resolveStructures(upwellStructures).catch(() => {})

    for (const [structureId] of upwellStructures) {
      const structure = getStructure(structureId)
      if (structure?.solarSystemId && !hasLocation(structure.solarSystemId)) {
        ids.locationIds.add(structure.solarSystemId)
      }
    }
  }

  const locationsPromise =
    ids.locationIds.size > 0
      ? resolveLocations(Array.from(ids.locationIds)).catch(() => {})
      : Promise.resolve()

  await Promise.all([typesPromise, entitiesPromise, locationsPromise])

  if (starbaseData.size > 0) {
    const starbaseStructures: CachedStructure[] = []
    for (const [starbaseId, data] of starbaseData) {
      if (hasStructure(starbaseId)) continue

      let name: string
      let solarSystemId: number

      if (data.moonId) {
        const moon = getLocation(data.moonId)
        name = moon?.name ?? `Moon ${data.moonId}`
        solarSystemId = moon?.solarSystemId ?? data.systemId
      } else {
        const system = getLocation(data.systemId)
        const type = getType(data.typeId)
        name = type?.name
          ? `${type.name} (${system?.name ?? `System ${data.systemId}`})`
          : `Starbase ${starbaseId}`
        solarSystemId = data.systemId
      }

      starbaseStructures.push({
        id: starbaseId,
        name,
        solarSystemId,
        typeId: data.typeId,
        ownerId: 0,
      })
    }
    if (starbaseStructures.length > 0) {
      await saveStructures(starbaseStructures)
      logger.info('Cached starbase locations', {
        module: 'DataResolver',
        count: starbaseStructures.length,
      })
    }
  }

  if (ids.typeIds.size > 0) {
    const { fetchPrices } = await import('@/api/ref-client')
    const { useAssetStore } = await import('@/store/asset-store')
    const prices = await fetchPrices(Array.from(ids.typeIds))
    if (prices.size > 0) {
      await useAssetStore.getState().setPrices(prices)
    }
  }

  if (ids.implantIds.size > 0) {
    const { fetchImplantSlots } = await import('@/api/ref-client')
    const slots = await fetchImplantSlots(Array.from(ids.implantIds))
    if (slots.size > 0) {
      const typesToUpdate: CachedType[] = []
      for (const [typeId, slot] of slots) {
        const existing = getType(typeId)
        if (existing && existing.implantSlot !== slot) {
          typesToUpdate.push({ ...existing, implantSlot: slot })
        }
      }
      if (typesToUpdate.length > 0) {
        await saveTypes(typesToUpdate)
      }
    }
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
  const { useStarbasesStore } = await import('@/store/starbases-store')
  const { useClonesStore } = await import('@/store/clones-store')
  const { useLoyaltyStore } = await import('@/store/loyalty-store')

  const ids = await collectResolutionIds(
    useAssetStore.getState().assetsByOwner,
    useContractsStore.getContractsByOwner(),
    useMarketOrdersStore.getOrdersByOwner(),
    useIndustryJobsStore.getJobsByOwner(),
    useStructuresStore.getState().dataByOwner,
    useStarbasesStore.getState().dataByOwner,
    useClonesStore.getState().dataByOwner,
    useLoyaltyStore.getState().dataByOwner
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
      notifyCacheListeners()
    }
  }, 50)
}
