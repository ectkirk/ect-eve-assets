import { esiClient } from '../esi-client'
import { resolveLocations } from '../ref-client'
import {
  hasStructure,
  getStructure as getCachedStructure,
  saveStructures,
  type CachedStructure,
} from '@/store/reference-cache'
import { logger } from '@/lib/logger'

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
    const data = await esiClient.fetch<ESIStructure>(
      `/universe/structures/${structureId}/`,
      { characterId }
    )
    return { status: 'success', data, characterId }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('403') || error.message.includes('Forbidden')) {
        return { status: 'denied' }
      }
      if (error.message.includes('404')) {
        return { status: 'not_found' }
      }
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
  const npcIds = Array.from(uncached.keys()).filter((id) => id < 1_000_000_000_000)
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
    ([id]) => id > 1_000_000_000_000
  )

  if (playerStructures.length > 0) {
    logger.info('Resolving player structures', {
      module: 'ESI',
      count: playerStructures.length,
    })

    for (const [structureId, characterId] of playerStructures) {
      if (esiClient.isRateLimited()) {
        logger.warn('Stopping structure resolution due to rate limit', { module: 'ESI' })
        break
      }

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
        logger.debug('Structure inaccessible', { module: 'ESI', structureId })
      }
    }
  }

  if (toCache.length > 0) {
    await saveStructures(toCache)
    logger.info('Cached structures', { module: 'ESI', count: toCache.length })
  }

  return results
}
