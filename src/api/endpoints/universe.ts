import { esiClient, ESI_COMPATIBILITY_DATE } from '../client'

export interface ESIStructure {
  name: string
  owner_id: number
  position?: {
    x: number
    y: number
    z: number
  }
  solar_system_id: number
  type_id?: number
}

export type UniverseNameCategory =
  | 'alliance'
  | 'character'
  | 'constellation'
  | 'corporation'
  | 'inventory_type'
  | 'region'
  | 'solar_system'
  | 'station'
  | 'faction'

export interface ESIUniverseName {
  category: UniverseNameCategory
  id: number
  name: string
}

// Cache for resolved names (persists for session)
const nameCache = new Map<number, ESIUniverseName>()

export async function getUniverseNames(ids: number[]): Promise<ESIUniverseName[]> {
  if (ids.length === 0) return []

  // Filter out already cached IDs
  const uncachedIds = ids.filter(id => !nameCache.has(id))
  const results: ESIUniverseName[] = []

  // Return cached results for IDs we already know
  for (const id of ids) {
    const cached = nameCache.get(id)
    if (cached) results.push(cached)
  }

  if (uncachedIds.length === 0) return results

  // ESI limits to 1000 IDs per request
  for (let i = 0; i < uncachedIds.length; i += 1000) {
    const chunk = uncachedIds.slice(i, i + 1000)
    try {
      const response = await fetch(
        'https://esi.evetech.net/latest/universe/names/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
          },
          body: JSON.stringify(chunk),
        }
      )

      if (!response.ok) {
        console.warn(`[ESI] universe/names failed for chunk: ${response.status}`)
        continue
      }

      const data = (await response.json()) as ESIUniverseName[]

      // Cache and add to results
      for (const item of data) {
        nameCache.set(item.id, item)
        results.push(item)
      }
    } catch (error) {
      console.warn('[ESI] universe/names error:', error)
    }
  }

  return results
}

// Resolve a single location ID to a name
// Returns null if not resolvable (player structures need separate handling)
export async function resolveLocationName(locationId: number): Promise<string | null> {
  // Check cache first
  const cached = nameCache.get(locationId)
  if (cached) return cached.name

  // Try to resolve via universe/names
  const results = await getUniverseNames([locationId])
  const found = results.find(r => r.id === locationId)
  return found?.name ?? null
}

// Bulk resolve location IDs - returns map of id -> name
export async function resolveLocationNames(locationIds: number[]): Promise<Map<number, string>> {
  const results = await getUniverseNames(locationIds)
  const nameMap = new Map<number, string>()
  for (const item of results) {
    nameMap.set(item.id, item.name)
  }
  return nameMap
}

export async function getStructure(structureId: number, characterId?: number): Promise<ESIStructure | null> {
  try {
    return await esiClient.fetch<ESIStructure>(
      `/universe/structures/${structureId}/`,
      {},
      characterId
    )
  } catch (error) {
    // 403 = no docking access, 404 = structure doesn't exist
    if (error instanceof Error && (error.message.includes('403') || error.message.includes('404'))) {
      return null
    }
    throw error
  }
}

// Try to get structure info using multiple characters (first success wins)
async function getStructureWithCharacters(
  structureId: number,
  characterIds: number[]
): Promise<ESIStructure | null> {
  for (const charId of characterIds) {
    try {
      const structure = await getStructure(structureId, charId)
      if (structure) {
        return structure
      }
    } catch {
      // Try next character
    }
  }
  return null
}

export async function resolveStructures(
  structureIds: number[],
  characterIds: number[] = []
): Promise<Map<number, ESIStructure>> {
  const results = new Map<number, ESIStructure>()
  const unresolvedIds = new Set(structureIds)

  // Try bulk resolution first (works for NPC stations, systems, etc.)
  const bulkNames = await getUniverseNames(structureIds)
  for (const item of bulkNames) {
    if (item.category === 'station') {
      results.set(item.id, {
        name: item.name,
        owner_id: 0,
        solar_system_id: 0,
      })
      unresolvedIds.delete(item.id)
    }
  }

  // Fall back to individual structure lookups for player structures
  // Try each character until one has docking access
  if (unresolvedIds.size > 0) {
    const batchSize = 10
    const remaining = Array.from(unresolvedIds)
    for (let i = 0; i < remaining.length; i += batchSize) {
      const batch = remaining.slice(i, i + batchSize)
      const promises = batch.map(async (id) => {
        try {
          const structure = characterIds.length > 0
            ? await getStructureWithCharacters(id, characterIds)
            : await getStructure(id)
          if (structure) {
            results.set(id, structure)
          }
        } catch {
          // Individual failures logged in getStructure
        }
      })
      await Promise.all(promises)
    }
  }

  return results
}

// ESI Group information
export interface ESIGroup {
  group_id: number
  category_id: number
  name: string
  published: boolean
  types: number[]
}

// Group cache (persists for session)
const groupCache = new Map<number, ESIGroup>()

// Fetch a single group from ESI
export async function getESIGroup(groupId: number): Promise<ESIGroup | null> {
  // Check cache first
  const cached = groupCache.get(groupId)
  if (cached) return cached

  try {
    const response = await fetch(
      `https://esi.evetech.net/latest/universe/groups/${groupId}/`,
      {
        headers: {
          'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) return null
      console.warn(`[ESI] universe/groups/${groupId} failed: ${response.status}`)
      return null
    }

    const group = (await response.json()) as ESIGroup
    groupCache.set(groupId, group)
    return group
  } catch (error) {
    console.warn(`[ESI] universe/groups/${groupId} error:`, error)
    return null
  }
}

// ESI Type information
export interface ESIType {
  type_id: number
  name: string
  description: string
  group_id: number
  market_group_id?: number
  volume?: number
  packaged_volume?: number
  capacity?: number
  mass?: number
  published: boolean
  portion_size?: number
  graphic_id?: number
  icon_id?: number
  radius?: number
  dogma_attributes?: Array<{ attribute_id: number; value: number }>
  dogma_effects?: Array<{ effect_id: number; is_default: boolean }>
}

// Resolved type with category info
export interface ResolvedType {
  typeId: number
  name: string
  groupId: number
  categoryId: number
  volume: number
  packagedVolume?: number
  marketGroupId?: number
  published: boolean
}

// Fetch a single type from ESI
export async function getESIType(typeId: number): Promise<ESIType | null> {
  try {
    const response = await fetch(
      `https://esi.evetech.net/latest/universe/types/${typeId}/`,
      {
        headers: {
          'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) return null
      console.warn(`[ESI] universe/types/${typeId} failed: ${response.status}`)
      return null
    }

    return (await response.json()) as ESIType
  } catch (error) {
    console.warn(`[ESI] universe/types/${typeId} error:`, error)
    return null
  }
}

// Batch fetch types with concurrency control
// Returns map of typeId -> ResolvedType (includes categoryId from group lookup)
export async function resolveTypes(
  typeIds: number[],
  concurrency = 20,
  onProgress?: (resolved: number, total: number) => void
): Promise<Map<number, ResolvedType>> {
  const results = new Map<number, ResolvedType>()
  if (typeIds.length === 0) return results

  const queue = [...typeIds]
  let resolved = 0
  const total = typeIds.length

  const worker = async () => {
    while (queue.length > 0) {
      const typeId = queue.shift()
      if (typeId === undefined) break

      const type = await getESIType(typeId)
      if (type) {
        // Fetch group to get categoryId
        const group = await getESIGroup(type.group_id)
        const categoryId = group?.category_id ?? 0

        results.set(typeId, {
          typeId: type.type_id,
          name: type.name,
          groupId: type.group_id,
          categoryId,
          volume: type.volume ?? 0,
          packagedVolume: type.packaged_volume,
          marketGroupId: type.market_group_id,
          published: type.published,
        })
      }
      resolved++
      onProgress?.(resolved, total)
    }
  }

  // Start workers up to concurrency limit
  const workers = Array(Math.min(concurrency, typeIds.length))
    .fill(null)
    .map(() => worker())

  await Promise.all(workers)
  return results
}
