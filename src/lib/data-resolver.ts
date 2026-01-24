import {
  hasType,
  getType,
  hasLocation,
  getLocation,
  hasStructure,
  getStructure,
  useReferenceCacheStore,
  type CachedStructure,
} from '@/store/reference-cache'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import {
  resolveStructures,
  resolveNames,
  hasName,
} from '@/api/endpoints/universe'
import { logger } from './logger'
import { getErrorMessage } from './errors'
import { PLAYER_STRUCTURE_ID_THRESHOLD } from './eve-constants'

export interface ResolutionIds {
  typeIds: Set<number>
  locationIds: Set<number>
  structureToCharacter: Map<number, number>
  entityIds: Set<number>
}

export type CollectorFn = (ids: ResolutionIds) => void

const collectors = new Map<string, CollectorFn>()

export function registerCollector(name: string, collector: CollectorFn): void {
  collectors.set(name, collector)
}

export function needsTypeResolution(typeId: number): boolean {
  return !hasType(typeId)
}

export {
  hasType,
  getType,
  hasLocation,
  hasStructure,
  getStructure,
  hasName,
  PLAYER_STRUCTURE_ID_THRESHOLD,
}

export function collectResolutionIds(): ResolutionIds {
  const ids: ResolutionIds = {
    typeIds: new Set(),
    locationIds: new Set(),
    structureToCharacter: new Map(),
    entityIds: new Set(),
  }

  for (const collector of collectors.values()) {
    collector(ids)
  }

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
    uncachedStarbases.length > 0

  if (!hasWork) return

  logger.info('Resolving reference data', {
    module: 'DataResolver',
    types: ids.typeIds.size,
    structures: upwellStructures.size,
    starbases: uncachedStarbases.length,
    locations: ids.locationIds.size,
    entities: ids.entityIds.size,
  })

  const typesPromise =
    ids.typeIds.size > 0
      ? resolveTypes(Array.from(ids.typeIds)).catch((err) => {
          logger.warn('Failed to resolve types', {
            module: 'DataResolver',
            error: getErrorMessage(err),
          })
        })
      : Promise.resolve()

  const entitiesPromise =
    ids.entityIds.size > 0
      ? resolveNames(Array.from(ids.entityIds)).catch((err) => {
          logger.warn('Failed to resolve entity names', {
            module: 'DataResolver',
            error: getErrorMessage(err),
          })
        })
      : Promise.resolve()

  if (upwellStructures.size > 0) {
    await resolveStructures(upwellStructures).catch((err) => {
      logger.warn('Failed to resolve structures', {
        module: 'DataResolver',
        error: getErrorMessage(err),
      })
    })

    for (const [structureId] of upwellStructures) {
      const structure = getStructure(structureId)
      if (structure?.solarSystemId && !hasLocation(structure.solarSystemId)) {
        ids.locationIds.add(structure.solarSystemId)
      }
    }
  }

  const locationsPromise =
    ids.locationIds.size > 0
      ? resolveLocations(Array.from(ids.locationIds)).catch((err) => {
          logger.warn('Failed to resolve locations', {
            module: 'DataResolver',
            error: getErrorMessage(err),
          })
        })
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
      await useReferenceCacheStore.getState().saveStructures(starbaseStructures)
      logger.info('Cached starbase locations', {
        module: 'DataResolver',
        count: starbaseStructures.length,
      })
    }
  }

  if (ids.typeIds.size > 0) {
    const { usePriceStore } = await import('@/store/price-store')
    await usePriceStore.getState().ensureJitaPrices(Array.from(ids.typeIds))
  }

  logger.info('Reference data resolution complete', { module: 'DataResolver' })
}

let resolutionPending = false
let resolutionQueued = false
let resolutionTimeout: ReturnType<typeof setTimeout> | null = null

async function runResolution(): Promise<void> {
  const ids = collectResolutionIds()
  await resolveAllReferenceData(ids)
}

export function triggerResolution(): void {
  if (resolutionPending || resolutionTimeout) {
    resolutionQueued = true
    return
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
