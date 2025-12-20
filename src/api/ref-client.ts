import { logger } from '@/lib/logger'
import {
  getType,
  saveTypes,
  getLocation,
  saveLocations,
  getGroup,
  getCategory,
  getSystem,
  getRegion,
  setCategories,
  setGroups,
  setRegions,
  setSystems,
  setStations,
  setRefStructures,
  setBlueprints,
  isReferenceDataLoaded,
  isAllTypesLoaded,
  setAllTypesLoaded,
  isUniverseDataLoaded,
  setUniverseDataLoaded,
  isRefStructuresLoaded,
  setRefStructuresLoaded,
  isBlueprintsLoaded,
  setBlueprintsLoaded,
  type CachedType,
  type CachedLocation,
  type CachedRegion,
  type CachedSystem,
  type CachedStation,
  type CachedRefStructure,
  type CachedBlueprint,
} from '@/store/reference-cache'
import {
  RefTypeSchema,
  RefCategoriesResponseSchema,
  RefGroupsResponseSchema,
  RefRegionsResponseSchema,
  RefSystemsResponseSchema,
  RefStationsResponseSchema,
  RefStructuresPageResponseSchema,
  RefImplantsResponseSchema,
  RefMoonsResponseSchema,
  MarketBulkResponseSchema,
  MarketBulkItemSchema,
  MarketJitaResponseSchema,
  MarketPlexResponseSchema,
  MarketContractsResponseSchema,
} from './schemas'
import { z } from 'zod'

export type MarketBulkItem = z.infer<typeof MarketBulkItemSchema>
export type RefType = z.infer<typeof RefTypeSchema>

const PLEX_GROUP = 1875
const CONTRACT_GROUPS = new Set([883, 547, 4594, 485, 1538, 659, 30])
const CHUNK_CONCURRENCY = 3

const CONTROL_TOWER_GROUP_ID = 365
const TIER_2_TOWER_PREFIXES = ['Dark Blood', 'Dread Guristas', 'Shadow', 'Domination', 'True Sansha']
const TIER_1_TOWER_PREFIXES = ['Angel', 'Blood', 'Guristas', 'Sansha', 'Serpentis']

function getTowerInfo(groupId: number, name: string): { towerSize?: number; fuelTier?: number } {
  if (groupId !== CONTROL_TOWER_GROUP_ID) return {}

  const towerSize = name.includes('Small') ? 1
                  : name.includes('Medium') ? 2
                  : 3

  const fuelTier = TIER_2_TOWER_PREFIXES.some(p => name.startsWith(p)) ? 2
                 : TIER_1_TOWER_PREFIXES.some(p => name.startsWith(p)) ? 1
                 : 0

  return { towerSize, fuelTier }
}

async function processChunksParallel<T, R>(
  items: T[],
  chunkSize: number,
  processor: (chunk: T[]) => Promise<R>,
  merger: (results: R, accumulated: R) => void,
  initial: R
): Promise<R> {
  if (items.length === 0) return initial

  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }

  const results = initial
  let index = 0

  async function processNext(): Promise<void> {
    while (index < chunks.length) {
      const chunkIndex = index++
      const chunk = chunks[chunkIndex]
      if (!chunk) continue
      const result = await processor(chunk)
      merger(result, results)
    }
  }

  const workers = Array.from(
    { length: Math.min(CHUNK_CONCURRENCY, chunks.length) },
    () => processNext()
  )
  await Promise.all(workers)

  return results
}

let referenceDataPromise: Promise<void> | null = null

export type ReferenceDataProgress = (status: string) => void

export function _resetForTests(): void {
  referenceDataPromise = null
}

export async function loadReferenceData(onProgress?: ReferenceDataProgress): Promise<void> {
  if (isReferenceDataLoaded() && isAllTypesLoaded() && isBlueprintsLoaded()) return

  if (referenceDataPromise) {
    return referenceDataPromise
  }

  referenceDataPromise = (async () => {
    const start = performance.now()

    if (!isReferenceDataLoaded()) {
      onProgress?.('Loading categories...')
      const [categoriesRaw, groupsRaw] = await Promise.all([
        window.electronAPI!.refCategories(),
        window.electronAPI!.refGroups(),
      ])

      if (categoriesRaw && 'error' in categoriesRaw) {
        logger.error('Failed to load categories', undefined, { module: 'RefAPI', error: categoriesRaw.error })
        return
      }

      if (groupsRaw && 'error' in groupsRaw) {
        logger.error('Failed to load groups', undefined, { module: 'RefAPI', error: groupsRaw.error })
        return
      }

      const categoriesResult = RefCategoriesResponseSchema.safeParse(categoriesRaw)
      if (!categoriesResult.success) {
        logger.error('Categories validation failed', undefined, { module: 'RefAPI', errors: categoriesResult.error.issues.slice(0, 3) })
        return
      }

      const groupsResult = RefGroupsResponseSchema.safeParse(groupsRaw)
      if (!groupsResult.success) {
        logger.error('Groups validation failed', undefined, { module: 'RefAPI', errors: groupsResult.error.issues.slice(0, 3) })
        return
      }

      const categories = Object.values(categoriesResult.data.items)
      const groups = Object.values(groupsResult.data.items)

      await setCategories(categories)
      await setGroups(groups)

      const catGroupDuration = Math.round(performance.now() - start)
      logger.info('Categories and groups loaded', { module: 'RefAPI', categories: categories.length, groups: groups.length, duration: catGroupDuration })
    }

    await loadAllTypes(onProgress)
    await loadBlueprints(onProgress)

    const duration = Math.round(performance.now() - start)
    logger.info('Reference data loaded', { module: 'RefAPI', duration })
  })().finally(() => {
    if (!isReferenceDataLoaded() || !isAllTypesLoaded() || !isBlueprintsLoaded()) {
      referenceDataPromise = null
    }
  })

  return referenceDataPromise
}

interface RawType {
  id: number
  name: string
  groupId?: number | null
  volume?: number | null
  packagedVolume?: number | null
}

function enrichType(raw: RawType): CachedType {
  const groupId = raw.groupId ?? 0
  const group = getGroup(groupId)
  const category = group ? getCategory(group.categoryId) : undefined
  const towerInfo = getTowerInfo(groupId, raw.name)

  return {
    id: raw.id,
    name: raw.name,
    groupId,
    groupName: group?.name ?? '',
    categoryId: group?.categoryId ?? 0,
    categoryName: category?.name ?? '',
    volume: raw.volume ?? 0,
    packagedVolume: raw.packagedVolume ?? undefined,
    ...towerInfo,
  }
}

async function loadAllTypes(onProgress?: ReferenceDataProgress): Promise<void> {
  if (isAllTypesLoaded()) return

  onProgress?.('Loading types...')
  const start = performance.now()
  let cursor: number | undefined
  let total = 0
  let loaded = 0
  let pageCount = 0

  do {
    const result = await window.electronAPI!.refTypesPage({ after: cursor })

    if (result.error) {
      logger.error('Failed to load types page', undefined, { module: 'RefAPI', error: result.error, cursor })
      return
    }

    if (!result.items || !result.pagination) {
      logger.error('Invalid types page response', undefined, { module: 'RefAPI', cursor })
      return
    }

    const rawTypes = Object.values(result.items) as RawType[]
    total = result.pagination.total
    loaded += rawTypes.length
    pageCount++

    if (rawTypes.length > 0) {
      const enrichedTypes = rawTypes.map(enrichType)
      await saveTypes(enrichedTypes)
    }

    onProgress?.(`Loading types (${loaded.toLocaleString()}/${total.toLocaleString()})...`)

    cursor = result.pagination.hasMore ? result.pagination.nextCursor : undefined
  } while (cursor !== undefined)

  setAllTypesLoaded(true)

  const duration = Math.round(performance.now() - start)
  logger.info('All types loaded', { module: 'RefAPI', total: loaded, pages: pageCount, duration })
}

async function loadBlueprints(onProgress?: ReferenceDataProgress): Promise<void> {
  if (isBlueprintsLoaded()) return

  onProgress?.('Loading blueprints...')
  const start = performance.now()

  const result = await window.electronAPI!.refBlueprints()

  if ('error' in result) {
    logger.error('Failed to load blueprints', undefined, { module: 'RefAPI', error: result.error })
    return
  }

  const blueprints: CachedBlueprint[] = Object.entries(result.items).map(([bpId, productId]) => ({
    id: Number(bpId),
    productId,
  }))

  await setBlueprints(blueprints)
  setBlueprintsLoaded(true)

  const duration = Math.round(performance.now() - start)
  logger.info('Blueprints loaded', { module: 'RefAPI', count: blueprints.length, duration })
}

let universeDataPromise: Promise<void> | null = null

export async function loadUniverseData(onProgress?: ReferenceDataProgress): Promise<void> {
  if (isUniverseDataLoaded()) return

  if (universeDataPromise) {
    return universeDataPromise
  }

  universeDataPromise = (async () => {
    const start = performance.now()

    try {
      onProgress?.('Loading regions...')
      await loadAllRegions()

      onProgress?.('Loading systems...')
      await loadAllSystems()

      onProgress?.('Loading stations...')
      await loadAllStations()

      setUniverseDataLoaded(true)

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

async function loadAllRegions(): Promise<void> {
  const result = await window.electronAPI!.refUniverseRegions()

  if (result.error) {
    logger.error('Failed to load regions', undefined, { module: 'RefAPI', error: result.error })
    return
  }

  if (!result.items) {
    logger.warn('No regions returned', { module: 'RefAPI' })
    return
  }

  const parseResult = RefRegionsResponseSchema.safeParse(result)
  if (!parseResult.success) {
    logger.error('Regions validation failed', undefined, {
      module: 'RefAPI',
      errors: parseResult.error.issues.slice(0, 3),
    })
    return
  }

  const regions: CachedRegion[] = Object.values(parseResult.data.items).map(r => ({
    id: r.id,
    name: r.name,
  }))

  await setRegions(regions)
}

async function loadAllSystems(): Promise<void> {
  const start = performance.now()
  const result = await window.electronAPI!.refUniverseSystems()

  if (result.error) {
    logger.error('Failed to load systems', undefined, { module: 'RefAPI', error: result.error })
    return
  }

  if (!result.items) {
    logger.warn('No systems returned', { module: 'RefAPI' })
    return
  }

  const parseResult = RefSystemsResponseSchema.safeParse(result)
  if (!parseResult.success) {
    logger.error('Systems validation failed', undefined, {
      module: 'RefAPI',
      errors: parseResult.error.issues.slice(0, 3),
    })
    return
  }

  const systems: CachedSystem[] = Object.values(parseResult.data.items).map(s => ({
    id: s.id,
    name: s.name,
    regionId: s.regionId,
    securityStatus: s.securityStatus,
  }))

  await setSystems(systems)

  const duration = Math.round(performance.now() - start)
  logger.info('Systems loaded', { module: 'RefAPI', count: systems.length, duration })
}

async function loadAllStations(): Promise<void> {
  const start = performance.now()
  const result = await window.electronAPI!.refUniverseStations()

  if (result.error) {
    logger.error('Failed to load stations', undefined, { module: 'RefAPI', error: result.error })
    return
  }

  if (!result.items) {
    logger.warn('No stations returned', { module: 'RefAPI' })
    return
  }

  const parseResult = RefStationsResponseSchema.safeParse(result)
  if (!parseResult.success) {
    logger.error('Stations validation failed', undefined, {
      module: 'RefAPI',
      errors: parseResult.error.issues.slice(0, 3),
    })
    return
  }

  const stations: CachedStation[] = Object.values(parseResult.data.items).map(s => ({
    id: s.id,
    name: s.name,
    systemId: s.systemId,
  }))

  await setStations(stations)

  const duration = Math.round(performance.now() - start)
  logger.info('Stations loaded', { module: 'RefAPI', count: stations.length, duration })
}

let refStructuresPromise: Promise<void> | null = null

export async function loadRefStructures(onProgress?: ReferenceDataProgress): Promise<void> {
  if (isRefStructuresLoaded()) return

  if (refStructuresPromise) {
    return refStructuresPromise
  }

  refStructuresPromise = (async () => {
    onProgress?.('Loading structures...')
    const start = performance.now()
    let cursor: string | undefined
    let total = 0
    let loaded = 0
    let pageCount = 0
    const allStructures: CachedRefStructure[] = []

    do {
      const result = await window.electronAPI!.refUniverseStructuresPage({ after: cursor })

      if (result.error) {
        logger.error('Failed to load structures page', undefined, { module: 'RefAPI', error: result.error })
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

      const structures: CachedRefStructure[] = Object.values(parseResult.data.items).map(s => ({
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

      onProgress?.(`Loading structures (${loaded.toLocaleString()}/${total.toLocaleString()})...`)

      cursor = result.pagination.hasMore ? (result.pagination.nextCursor ?? undefined) : undefined
    } while (cursor !== undefined)

    await setRefStructures(allStructures)
    setRefStructuresLoaded(true)

    const duration = Math.round(performance.now() - start)
    logger.info('RefStructures loaded', { module: 'RefAPI', count: allStructures.length, pages: pageCount, duration })
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

  try {
    const rawData = await window.electronAPI!.refMoons(ids)
    const duration = Math.round(performance.now() - start)

    if (rawData && 'error' in rawData && rawData.error) {
      logger.warn('RefAPI /moons failed', { module: 'RefAPI', error: rawData.error, requested: ids.length, duration })
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

    logger.info('RefAPI /moons', { module: 'RefAPI', requested: ids.length, returned: results.size, duration })
  } catch (error) {
    logger.error('RefAPI /moons error', error, { module: 'RefAPI' })
  }

  return results
}

export async function resolveTypes(typeIds: number[]): Promise<Map<number, CachedType>> {
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

export async function resolveLocations(locationIds: number[]): Promise<Map<number, CachedLocation>> {
  await loadUniverseData()

  const results = new Map<number, CachedLocation>()
  const moonIds: number[] = []

  for (const id of locationIds) {
    if (id > 1_000_000_000_000) continue

    const cached = getLocation(id)
    if (cached) {
      results.set(id, cached)
      continue
    }

    if (isCelestialIdRange(id)) {
      moonIds.push(id)
    } else {
      results.set(id, {
        id,
        name: getLocationFallbackName(id),
        type: 'station',
      })
    }
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
        regionName: system?.regionId ? getRegion(system.regionId)?.name : undefined,
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
    await saveLocations(toCache)
  }

  return results
}

const THE_FORGE_REGION_ID = 10000002

interface MarketBulkOptions {
  avg?: boolean
  buy?: boolean
  jita?: boolean
}

function createMarketChunkFetcher(options: MarketBulkOptions) {
  return async (chunk: number[]): Promise<Map<number, MarketBulkItem>> => {
    const results = new Map<number, MarketBulkItem>()
    const chunkStart = performance.now()

    try {
      const rawData = await window.electronAPI!.refMarket({
        regionId: THE_FORGE_REGION_ID,
        typeIds: chunk,
        ...options,
      })
      const duration = Math.round(performance.now() - chunkStart)

      if (rawData && typeof rawData === 'object' && 'error' in rawData) {
        logger.warn('RefAPI /market/bulk failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
        return results
      }

      const parseResult = MarketBulkResponseSchema.safeParse(rawData)
      if (!parseResult.success) {
        logger.error('RefAPI /market/bulk validation failed', undefined, {
          module: 'RefAPI',
          errors: parseResult.error.issues.slice(0, 3),
        })
        return results
      }

      const returned = Object.keys(parseResult.data.items).length
      logger.info('RefAPI /market/bulk', { module: 'RefAPI', requested: chunk.length, returned, duration })

      for (const [idStr, item] of Object.entries(parseResult.data.items)) {
        results.set(Number(idStr), item)
      }
    } catch (error) {
      logger.error('RefAPI /market/bulk error', error, { module: 'RefAPI' })
    }

    return results
  }
}

async function fetchMarketFromAPI(
  typeIds: number[],
  options: MarketBulkOptions = {}
): Promise<Map<number, MarketBulkItem>> {
  if (typeIds.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    typeIds,
    100,
    createMarketChunkFetcher(options),
    (chunk, acc) => { for (const [k, v] of chunk) acc.set(k, v) },
    new Map<number, MarketBulkItem>()
  )

  if (typeIds.length > 100) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/bulk total', { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function fetchJitaPricesChunk(chunk: number[]): Promise<Map<number, number>> {
  const results = new Map<number, number>()
  const chunkStart = performance.now()

  try {
    const rawData = await window.electronAPI!.refMarketJita(chunk)
    const duration = Math.round(performance.now() - chunkStart)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /market/jita failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
      return results
    }

    const parseResult = MarketJitaResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /market/jita validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
    }

    let returned = 0
    for (const [idStr, price] of Object.entries(parseResult.data.items)) {
      if (price !== null && price > 0) {
        results.set(Number(idStr), price)
        returned++
      }
    }
    logger.info('RefAPI /market/jita', { module: 'RefAPI', requested: chunk.length, returned, duration })
  } catch (error) {
    logger.error('RefAPI /market/jita error', error, { module: 'RefAPI' })
  }

  return results
}

async function fetchJitaPricesFromAPI(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    typeIds,
    1000,
    fetchJitaPricesChunk,
    (chunk, acc) => { for (const [k, v] of chunk) acc.set(k, v) },
    new Map<number, number>()
  )

  if (typeIds.length > 1000) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/jita total', { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration: totalDuration })
  }

  return results
}

async function fetchPlexPriceFromAPI(): Promise<number | null> {
  const start = performance.now()
  try {
    const rawData = await window.electronAPI!.refMarketPlex()
    const duration = Math.round(performance.now() - start)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /market/plex failed', { module: 'RefAPI', error: rawData.error, duration })
      return null
    }

    const parseResult = MarketPlexResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /market/plex validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return null
    }

    logger.info('RefAPI /market/plex', { module: 'RefAPI', duration })
    return parseResult.data.lowestSell
  } catch (error) {
    logger.error('RefAPI /market/plex error', error, { module: 'RefAPI' })
    return null
  }
}

async function fetchContractPricesChunk(chunk: number[]): Promise<Map<number, number>> {
  const results = new Map<number, number>()
  const chunkStart = performance.now()

  try {
    const rawData = await window.electronAPI!.refMarketContracts(chunk)
    const duration = Math.round(performance.now() - chunkStart)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /market/contracts failed', { module: 'RefAPI', error: rawData.error, requested: chunk.length, duration })
      return results
    }

    const parseResult = MarketContractsResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /market/contracts validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
    }

    let returned = 0
    for (const [idStr, item] of Object.entries(parseResult.data.items)) {
      if (item.price !== null && item.price > 0 && item.hasSufficientData) {
        results.set(Number(idStr), item.price)
        returned++
      }
    }
    logger.info('RefAPI /market/contracts', { module: 'RefAPI', requested: chunk.length, returned, duration })
  } catch (error) {
    logger.error('RefAPI /market/contracts error', error, { module: 'RefAPI' })
  }

  return results
}

async function fetchContractPricesFromAPI(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const totalStart = performance.now()

  const results = await processChunksParallel(
    typeIds,
    100,
    fetchContractPricesChunk,
    (chunk, acc) => { for (const [k, v] of chunk) acc.set(k, v) },
    new Map<number, number>()
  )

  if (typeIds.length > 100) {
    const totalDuration = Math.round(performance.now() - totalStart)
    logger.info('RefAPI /market/contracts total', { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration: totalDuration })
  }

  return results
}

function categorizeTypeIdsByEndpoint(typeIds: number[]): {
  plexIds: number[]
  contractIds: number[]
  jitaIds: number[]
} {
  const plexIds: number[] = []
  const contractIds: number[] = []
  const jitaIds: number[] = []

  for (const typeId of typeIds) {
    const cachedType = getType(typeId)
    const groupId = cachedType?.groupId ?? 0

    if (groupId === PLEX_GROUP) {
      plexIds.push(typeId)
    } else if (CONTRACT_GROUPS.has(groupId)) {
      contractIds.push(typeId)
    } else {
      jitaIds.push(typeId)
    }
  }

  return { plexIds, contractIds, jitaIds }
}

async function fetchPricesRouted(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  await resolveTypes(typeIds)

  const { plexIds, contractIds } = categorizeTypeIdsByEndpoint(typeIds)
  const results = new Map<number, number>()

  const jitaPrices = await fetchJitaPricesFromAPI(typeIds)
  for (const [id, price] of jitaPrices) {
    results.set(id, price)
  }

  const enhancePromises: Promise<void>[] = []

  if (plexIds.length > 0) {
    enhancePromises.push(
      fetchPlexPriceFromAPI().then((price) => {
        if (price !== null) {
          for (const id of plexIds) {
            results.set(id, price)
          }
        }
      })
    )
  }

  if (contractIds.length > 0) {
    enhancePromises.push(
      fetchContractPricesFromAPI(contractIds).then((prices) => {
        for (const [id, price] of prices) {
          results.set(id, price)
        }
      })
    )
  }

  if (enhancePromises.length > 0) {
    await Promise.all(enhancePromises)
  }

  logger.info('Prices fetched', {
    module: 'RefAPI',
    total: typeIds.length,
    jita: jitaPrices.size,
    plex: plexIds.length,
    contracts: contractIds.length,
    returned: results.size,
  })

  return results
}

export async function fetchPrices(typeIds: number[]): Promise<Map<number, number>> {
  return fetchPricesRouted(typeIds)
}

export const queuePriceRefresh = fetchPrices

export interface MarketComparisonPrices {
  averagePrice: number | null
  highestBuy: number | null
  lowestSell: number | null
}

export async function fetchMarketComparison(
  typeIds: number[]
): Promise<Map<number, MarketComparisonPrices>> {
  const fetched = await fetchMarketFromAPI(typeIds, { avg: true, buy: true, jita: true })
  const results = new Map<number, MarketComparisonPrices>()

  for (const [typeId, item] of fetched) {
    results.set(typeId, {
      averagePrice: item.averagePrice ?? null,
      highestBuy: item.highestBuy ?? null,
      lowestSell: item.lowestSell,
    })
  }

  return results
}

export async function fetchImplantSlots(typeIds: number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map()

  const start = performance.now()
  const results = new Map<number, number>()

  try {
    const rawData = await window.electronAPI!.refImplants(typeIds)
    const duration = Math.round(performance.now() - start)

    if (rawData && typeof rawData === 'object' && 'error' in rawData) {
      logger.warn('RefAPI /implants failed', { module: 'RefAPI', error: rawData.error, duration })
      return results
    }

    const parseResult = RefImplantsResponseSchema.safeParse(rawData)
    if (!parseResult.success) {
      logger.error('RefAPI /implants validation failed', undefined, {
        module: 'RefAPI',
        errors: parseResult.error.issues.slice(0, 3),
      })
      return results
    }

    for (const [idStr, item] of Object.entries(parseResult.data.items)) {
      results.set(Number(idStr), item.slot)
    }

    logger.info('RefAPI /implants', { module: 'RefAPI', requested: typeIds.length, returned: results.size, duration })
  } catch (error) {
    logger.error('RefAPI /implants error', error, { module: 'RefAPI' })
  }

  return results
}
