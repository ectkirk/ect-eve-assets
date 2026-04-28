import { i18n } from '@/i18n'
import { logger } from '@/lib/logger'
import { formatFullNumber } from '@/lib/utils'
import {
  getType,
  getLocation,
  getSystem,
  getRegion,
  isUniverseDataLoaded,
  isRefStructuresLoaded,
  useReferenceCacheStore,
  type CachedType,
  type CachedLocation,
  type CachedRegion,
  type CachedSystem,
  type CachedStation,
  type CachedStargate,
  type CachedRefStructure,
} from '@/store/reference-cache'
import { getLanguage } from '@/store/settings-store'
import {
  RefRegionsResponseSchema,
  RefSystemsResponseSchema,
  RefStationsResponseSchema,
  RefStargatesResponseSchema,
  RefStructuresPageResponseSchema,
  RefMoonsResponseSchema,
} from './schemas'
import {
  loadReferenceData,
  type ReferenceDataProgress,
} from './ref-data-loader'
import { PLAYER_STRUCTURE_ID_THRESHOLD } from '@/lib/eve-constants'

let universeDataPromise: Promise<void> | null = null

export async function loadUniverseData(
  onProgress?: ReferenceDataProgress,
): Promise<void> {
  if (isUniverseDataLoaded()) return

  if (universeDataPromise) {
    return universeDataPromise
  }

  universeDataPromise = (async () => {
    const start = performance.now()

    try {
      onProgress?.(i18n.t('status.loadingUniverse'))
      const results = await Promise.all([
        loadAllRegions(),
        loadAllSystems(),
        loadAllStations(),
        loadAllStargates(),
      ])

      const allSucceeded = results.every(Boolean)
      if (!allSucceeded) {
        logger.warn('Universe data loaded with partial failures', {
          module: 'RefAPI',
          regions: results[0],
          systems: results[1],
          stations: results[2],
          stargates: results[3],
        })
      }

      if (allSucceeded) {
        useReferenceCacheStore.getState().setUniverseDataLoaded(true)
      }

      const duration = Math.round(performance.now() - start)
      logger.info('Universe data loaded', { module: 'RefAPI', duration })
    } catch (error) {
      logger.error('Failed to load universe data', error, { module: 'RefAPI' })
    }
  })().finally(() => {
    universeDataPromise = null
  })

  return universeDataPromise
}

async function loadUniverseEntities<TRaw, TParsed>(config: {
  fetch: () => Promise<{ error?: string; items?: unknown }>
  schema: {
    safeParse: (data: unknown) => {
      success: boolean
      data?: { items: Record<string, TRaw> }
      error?: { issues: unknown[] }
    }
  }
  entityName: string
  mapper: (raw: TRaw) => TParsed
  setter: (items: TParsed[]) => Promise<void>
}): Promise<boolean> {
  const start = performance.now()
  const result = await config.fetch()

  if (result.error) {
    logger.error(`Failed to load ${config.entityName}`, undefined, {
      module: 'RefAPI',
      error: result.error,
    })
    return false
  }

  if (!result.items) {
    logger.warn(`No ${config.entityName} returned`, { module: 'RefAPI' })
    return false
  }

  const parseResult = config.schema.safeParse(result)
  if (!parseResult.success) {
    logger.error(`${config.entityName} validation failed`, undefined, {
      module: 'RefAPI',
      errors: parseResult.error!.issues.slice(0, 3),
    })
    return false
  }

  const entities = Object.values(parseResult.data!.items).map(config.mapper)
  await config.setter(entities)

  const duration = Math.round(performance.now() - start)
  if (entities.length > 0) {
    logger.info(`${config.entityName} loaded`, {
      module: 'RefAPI',
      count: entities.length,
      duration,
    })
  }
  return true
}

function loadAllRegions(): Promise<boolean> {
  const language = getLanguage()
  return loadUniverseEntities({
    fetch: () => window.electronAPI!.refUniverseRegions({ language }),
    schema: RefRegionsResponseSchema,
    entityName: 'Regions',
    mapper: (r): CachedRegion => ({ id: r.id, name: r.name }),
    setter: (regions) => useReferenceCacheStore.getState().setRegions(regions),
  })
}

function loadAllSystems(): Promise<boolean> {
  const language = getLanguage()
  return loadUniverseEntities({
    fetch: () => window.electronAPI!.refUniverseSystems({ language }),
    schema: RefSystemsResponseSchema,
    entityName: 'Systems',
    mapper: (s): CachedSystem => ({
      id: s.id,
      name: s.name,
      regionId: s.regionId,
      securityStatus: s.securityStatus,
      position2D: s.position2D,
    }),
    setter: (systems) => useReferenceCacheStore.getState().setSystems(systems),
  })
}

function loadAllStations(): Promise<boolean> {
  const language = getLanguage()
  return loadUniverseEntities({
    fetch: () => window.electronAPI!.refUniverseStations({ language }),
    schema: RefStationsResponseSchema,
    entityName: 'Stations',
    mapper: (s): CachedStation => ({
      id: s.id,
      name: s.name,
      systemId: s.systemId,
    }),
    setter: (stations) =>
      useReferenceCacheStore.getState().setStations(stations),
  })
}

function loadAllStargates(): Promise<boolean> {
  return loadUniverseEntities({
    fetch: () => window.electronAPI!.refUniverseStargates(),
    schema: RefStargatesResponseSchema,
    entityName: 'Stargates',
    mapper: (s): CachedStargate => ({
      id: s.id,
      from: s.from,
      to: s.to,
    }),
    setter: (stargates) =>
      useReferenceCacheStore.getState().setStargates(stargates),
  })
}

let refStructuresPromise: Promise<void> | null = null

export async function loadRefStructures(
  onProgress?: ReferenceDataProgress,
): Promise<void> {
  if (isRefStructuresLoaded()) return

  if (refStructuresPromise) {
    return refStructuresPromise
  }

  refStructuresPromise = (async () => {
    onProgress?.(i18n.t('status.loadingStructures'))
    const start = performance.now()
    let cursor: string | undefined
    let total = 0
    let loaded = 0
    let pageCount = 0
    const allStructures: CachedRefStructure[] = []

    do {
      const result = await window.electronAPI!.refUniverseStructuresPage({
        after: cursor,
      })

      if (result.error) {
        logger.error('Failed to load structures page', undefined, {
          module: 'RefAPI',
          error: result.error,
        })
        return
      }

      if (!result.items || !result.pagination) {
        logger.warn('No structures returned', { module: 'RefAPI' })
        return
      }

      const parseResult = RefStructuresPageResponseSchema.safeParse(result)
      if (!parseResult.success) {
        logger.error('Structures validation failed', undefined, {
          module: 'RefAPI',
          errors: parseResult.error.issues.slice(0, 3),
        })
        return
      }

      const structures: CachedRefStructure[] = Object.values(
        parseResult.data.items,
      ).map((s) => ({
        id: parseInt(s.id, 10),
        name: s.name,
        systemId: s.systemId,
      }))

      allStructures.push(...structures)

      if (pageCount === 0) {
        total = result.pagination.total
      }
      loaded += structures.length
      pageCount++

      onProgress?.(
        i18n.t('status.loadingStructuresProgress', {
          loaded: formatFullNumber(loaded),
          total: formatFullNumber(total),
        }),
      )

      cursor = result.pagination.hasMore
        ? (result.pagination.nextCursor ?? undefined)
        : undefined
    } while (cursor !== undefined)

    await useReferenceCacheStore.getState().setRefStructures(allStructures)
    useReferenceCacheStore.getState().setRefStructuresLoaded(true)

    const duration = Math.round(performance.now() - start)
    logger.info('RefStructures loaded', {
      module: 'RefAPI',
      count: allStructures.length,
      pages: pageCount,
      duration,
    })
  })().finally(() => {
    refStructuresPromise = null
  })

  return refStructuresPromise
}

interface MoonData {
  id: number
  name: string
  systemId: number
}

async function fetchMoons(ids: number[]): Promise<Map<number, MoonData>> {
  if (ids.length === 0) return new Map()

  const start = performance.now()
  const results = new Map<number, MoonData>()
  const language = getLanguage()

  try {
    const rawData = await window.electronAPI!.refMoons(ids, { language })
    const duration = Math.round(performance.now() - start)

    if (rawData && 'error' in rawData && rawData.error) {
      logger.warn('RefAPI /moons failed', {
        module: 'RefAPI',
        error: rawData.error,
        requested: ids.length,
        duration,
      })
      return results
    }

    const parseResult = RefMoonsResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /moons validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
    }

    for (const [idStr, moon] of Object.entries(parseResult.data.items)) {
      results.set(Number(idStr), moon)
    }

    logger.info('RefAPI /moons', {
      module: 'RefAPI',
      requested: ids.length,
      returned: results.size,
      duration,
    })
  } catch (error) {
    logger.error('RefAPI /moons error', error, { module: 'RefAPI' })
  }

  return results
}

export async function resolveTypes(
  typeIds: number[],
): Promise<Map<number, CachedType>> {
  await loadReferenceData()

  const results = new Map<number, CachedType>()
  for (const id of typeIds) {
    const cached = getType(id)
    if (cached) {
      results.set(id, cached)
    }
  }
  return results
}

function getLocationFallbackName(id: number): string {
  if (id >= 60000000 && id < 70000000) return `Station ${id}`
  if (id >= 50000000 && id < 60000000) return `Stargate ${id}`
  if (id >= 40000000 && id < 50000000) return `Celestial ${id}`
  if (id >= 30000000 && id < 40000000) return `System ${id}`
  if (id >= 20000000 && id < 30000000) return `Constellation ${id}`
  if (id >= 10000000 && id < 20000000) return `Region ${id}`
  return `Location ${id}`
}

function isCelestialIdRange(id: number): boolean {
  return id >= 40000000 && id < 50000000
}

export async function resolveLocations(
  locationIds: number[],
): Promise<Map<number, CachedLocation>> {
  await loadUniverseData()

  const results = new Map<number, CachedLocation>()
  const moonIds: number[] = []
  const fallbacks: CachedLocation[] = []

  for (const id of locationIds) {
    if (id >= PLAYER_STRUCTURE_ID_THRESHOLD) continue

    const cached = getLocation(id)
    if (cached) {
      results.set(id, cached)
      continue
    }

    if (isCelestialIdRange(id)) {
      moonIds.push(id)
    } else {
      const fallback: CachedLocation = {
        id,
        name: getLocationFallbackName(id),
        type: 'station',
      }
      results.set(id, fallback)
      fallbacks.push(fallback)
    }
  }

  if (fallbacks.length > 0) {
    await useReferenceCacheStore.getState().saveLocations(fallbacks)
  }

  if (moonIds.length === 0) return results

  const fetched = await fetchMoons(moonIds)

  const toCache: CachedLocation[] = []

  for (const id of moonIds) {
    const moon = fetched.get(id)

    if (moon) {
      const system = getSystem(moon.systemId)
      const cached: CachedLocation = {
        id,
        name: moon.name,
        type: 'celestial',
        solarSystemId: moon.systemId,
        solarSystemName: system?.name,
        regionId: system?.regionId,
        regionName: system?.regionId
          ? getRegion(system.regionId)?.name
          : undefined,
      }
      results.set(id, cached)
      toCache.push(cached)
    } else {
      const placeholder: CachedLocation = {
        id,
        name: `Celestial ${id}`,
        type: 'celestial',
      }
      results.set(id, placeholder)
      toCache.push(placeholder)
    }
  }

  if (toCache.length > 0) {
    await useReferenceCacheStore.getState().saveLocations(toCache)
  }

  return results
}
