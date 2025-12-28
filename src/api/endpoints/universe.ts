import { esi, ESIError } from '../esi'
import { resolveLocations } from '../ref-client'
import {
  hasStructure,
  getStructure as getCachedStructure,
  useReferenceCacheStore,
  type CachedStructure,
  type CachedName,
} from '@/store/reference-cache'
import { logger } from '@/lib/logger'
import { PLAYER_STRUCTURE_ID_THRESHOLD } from '@/lib/eve-constants'
import { createLRUCache } from '@/lib/lru-cache'
import {
  ESIStructureSchema,
  ESINameSchema,
  ESITypeInfoSchema,
} from '../schemas'
import { z } from 'zod'

export type ESITypeInfo = z.infer<typeof ESITypeInfoSchema>

export type ESIStructure = z.infer<typeof ESIStructureSchema>

type StructureResult =
  | { status: 'success'; data: ESIStructure; characterId: number }
  | { status: 'denied' }
  | { status: 'not_found' }
  | { status: 'error' }

async function getStructureFromESI(
  structureId: number,
  characterId: number
): Promise<StructureResult> {
  try {
    const data = await esi.fetch<ESIStructure>(
      `/universe/structures/${structureId}`,
      { characterId, schema: ESIStructureSchema }
    )
    return { status: 'success', data, characterId }
  } catch (error) {
    if (error instanceof ESIError) {
      if (error.status === 403) return { status: 'denied' }
      if (error.status === 404) return { status: 'not_found' }
    }
    return { status: 'error' }
  }
}

export async function resolveStructures(
  structureToCharacter: Map<number, number>
): Promise<Map<number, CachedStructure>> {
  const results = new Map<number, CachedStructure>()
  const uncached = new Map<number, number>()

  for (const [structureId, characterId] of structureToCharacter) {
    if (hasStructure(structureId)) {
      results.set(structureId, getCachedStructure(structureId)!)
    } else {
      uncached.set(structureId, characterId)
    }
  }

  if (uncached.size === 0) return results

  const toCache: CachedStructure[] = []

  // NPC stations via ref API
  const npcIds = Array.from(uncached.keys()).filter(
    (id) => id < PLAYER_STRUCTURE_ID_THRESHOLD
  )
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
        uncached.delete(id)
      }
    }
  }

  // Player structures via ESI - only try the character who owns assets there
  const playerStructures = Array.from(uncached.entries()).filter(
    ([id]) => id >= PLAYER_STRUCTURE_ID_THRESHOLD
  )

  if (playerStructures.length > 0) {
    logger.info('Resolving player structures', {
      module: 'ESI',
      count: playerStructures.length,
    })

    for (const [structureId, characterId] of playerStructures) {
      const result = await getStructureFromESI(structureId, characterId)

      if (result.status === 'success') {
        const cached: CachedStructure = {
          id: structureId,
          name: result.data.name,
          solarSystemId: result.data.solar_system_id,
          typeId: result.data.type_id ?? 0,
          ownerId: result.data.owner_id,
          resolvedByCharacterId: result.characterId,
        }
        results.set(structureId, cached)
        toCache.push(cached)
      } else {
        const placeholder: CachedStructure = {
          id: structureId,
          name: 'Unknown Structure',
          solarSystemId: 0,
          typeId: 0,
          ownerId: 0,
          inaccessible: true,
        }
        results.set(structureId, placeholder)
        toCache.push(placeholder)
      }
    }
  }

  if (toCache.length > 0) {
    await useReferenceCacheStore.getState().saveStructures(toCache)
    logger.info('Cached structures', { module: 'ESI', count: toCache.length })
  }

  return results
}

export type ESIName = z.infer<typeof ESINameSchema>
export type ESINameCategory = ESIName['category']

const NAMES_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const NAMES_CACHE_MAX_SIZE = 10000
const namesCache = createLRUCache<number, ESIName>(
  NAMES_CACHE_TTL_MS,
  NAMES_CACHE_MAX_SIZE
)

export function getName(id: number): ESIName | undefined {
  return namesCache.get(id) ?? undefined
}

export function hasName(id: number): boolean {
  return namesCache.get(id) !== null
}

export async function resolveNames(
  ids: number[]
): Promise<Map<number, ESIName>> {
  if (ids.length === 0) return new Map()

  const results = new Map<number, ESIName>()
  const uncached: number[] = []

  for (const id of ids) {
    const cached = namesCache.get(id)
    if (cached) {
      results.set(id, cached)
    } else {
      uncached.push(id)
    }
  }

  if (uncached.length === 0) return results

  const toSave: CachedName[] = []

  for (let i = 0; i < uncached.length; i += 1000) {
    const chunk = uncached.slice(i, i + 1000)
    try {
      const names = await esi.fetch<ESIName[]>('/universe/names', {
        method: 'POST',
        body: JSON.stringify(chunk),
        requiresAuth: false,
        schema: z.array(ESINameSchema),
      })
      for (const item of names) {
        namesCache.set(item.id, item)
        results.set(item.id, item)
        toSave.push(item as CachedName)
      }
    } catch {
      logger.warn('Failed to resolve names', {
        module: 'ESI',
        count: chunk.length,
      })
    }
  }

  if (toSave.length > 0) {
    await useReferenceCacheStore.getState().saveNames(toSave)
  }

  return results
}

export async function getTypeInfo(typeId: number): Promise<ESITypeInfo> {
  return esi.fetch<ESITypeInfo>(`/universe/types/${typeId}`, {
    requiresAuth: false,
    schema: ESITypeInfoSchema,
  })
}
