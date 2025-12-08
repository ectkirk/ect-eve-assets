import { esiClient } from '../client'
import { resolveTypes as refResolveTypes, resolveLocations } from '../ref-client'
import {
  hasStructure,
  getStructure as getCachedStructure,
  saveStructures,
  type CachedStructure,
  type CachedType,
} from '@/store/reference-cache'

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

export async function resolveLocationName(locationId: number): Promise<string | null> {
  const results = await resolveLocations([locationId])
  const item = results.get(locationId)
  return item?.name ?? null
}

export async function resolveLocationNames(locationIds: number[]): Promise<Map<number, string>> {
  const resolved = await resolveLocations(locationIds)
  const nameMap = new Map<number, string>()
  for (const [id, loc] of resolved) {
    nameMap.set(id, loc.name)
  }
  return nameMap
}

async function getStructureFromESI(structureId: number, characterId?: number): Promise<ESIStructure | null> {
  try {
    return await esiClient.fetch<ESIStructure>(
      `/universe/structures/${structureId}/`,
      {},
      characterId
    )
  } catch (error) {
    if (error instanceof Error && (error.message.includes('403') || error.message.includes('404'))) {
      return null
    }
    throw error
  }
}

async function getStructureWithCharacters(
  structureId: number,
  characterIds: number[]
): Promise<ESIStructure | null> {
  for (const charId of characterIds) {
    try {
      const structure = await getStructureFromESI(structureId, charId)
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
): Promise<Map<number, CachedStructure>> {
  const results = new Map<number, CachedStructure>()
  const uncachedIds: number[] = []

  for (const id of structureIds) {
    if (hasStructure(id)) {
      results.set(id, getCachedStructure(id)!)
    } else {
      uncachedIds.push(id)
    }
  }

  if (uncachedIds.length === 0) return results

  const toCache: CachedStructure[] = []

  // Try ref API for NPC stations first
  const npcIds = uncachedIds.filter((id) => id < 1_000_000_000_000)
  if (npcIds.length > 0) {
    const resolved = await resolveLocations(npcIds)
    for (const [id, loc] of resolved) {
      if (loc.type === 'station') {
        const cached: CachedStructure = {
          id,
          name: loc.name,
          solarSystemId: 0,
          typeId: 0,
          ownerId: 0,
        }
        results.set(id, cached)
        toCache.push(cached)
      }
    }
  }

  // Player structures need ESI auth
  const playerStructureIds = uncachedIds.filter(
    (id) => id > 1_000_000_000_000 && !results.has(id)
  )

  if (playerStructureIds.length > 0 && characterIds.length > 0) {
    const batchSize = 10
    for (let i = 0; i < playerStructureIds.length; i += batchSize) {
      const batch = playerStructureIds.slice(i, i + batchSize)
      const promises = batch.map(async (id) => {
        try {
          const structure = await getStructureWithCharacters(id, characterIds)
          if (structure) {
            const cached: CachedStructure = {
              id,
              name: structure.name,
              solarSystemId: structure.solar_system_id,
              typeId: structure.type_id ?? 0,
              ownerId: structure.owner_id,
            }
            results.set(id, cached)
            toCache.push(cached)
          }
        } catch {
          // Skip failed lookups
        }
      })
      await Promise.all(promises)
    }
  }

  if (toCache.length > 0) {
    await saveStructures(toCache)
  }

  return results
}

export async function resolveTypes(
  typeIds: number[],
  _concurrency = 20,
  onProgress?: (resolved: number, total: number) => void
): Promise<Map<number, CachedType>> {
  if (typeIds.length === 0) return new Map()
  onProgress?.(0, typeIds.length)
  const results = await refResolveTypes(typeIds)
  onProgress?.(results.size, typeIds.length)
  return results
}
