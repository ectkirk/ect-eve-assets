import { type Owner } from './auth-store'
import { createOwnerStore } from './create-owner-store'
import { esi } from '@/api/esi'
import { ESICharacterLocationSchema, ESICloneSchema } from '@/api/schemas'
import {
  registerCollector,
  needsTypeResolution,
  hasLocation,
  hasStructure,
  type ResolutionIds,
} from '@/lib/data-resolver'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESIClone = z.infer<typeof ESICloneSchema>
export type ESICharacterLocation = z.infer<typeof ESICharacterLocationSchema>

interface CloneData {
  clones: ESIClone
  activeImplants: number[]
  activeLocation: ESICharacterLocation | undefined
}

export interface CharacterCloneData {
  owner: Owner
  clones: ESIClone
  activeImplants: number[]
  activeLocation: ESICharacterLocation | undefined
}

export const useClonesStore = createOwnerStore<CloneData, CharacterCloneData>({
  name: 'clones',
  moduleName: 'ClonesStore',
  endpointPattern: '/clones',
  dbConfig: {
    dbName: 'ecteveassets-clones',
    storeName: 'clones',
    metaStoreName: 'meta',
    serialize: (data) => ({
      clones: data.clones,
      activeImplants: data.activeImplants,
      activeLocation: data.activeLocation,
    }),
    deserialize: (stored) => ({
      clones: stored['clones'] as ESIClone,
      activeImplants: stored['activeImplants'] as number[],
      activeLocation: stored['activeLocation'] as
        | ESICharacterLocation
        | undefined,
    }),
  },
  ownerFilter: 'character',
  disableAutoRefresh: true,
  getEndpoint: (owner) => `/characters/${owner.characterId}/clones`,
  fetchData: async (owner) => {
    const [clonesResult, implantsResult, locationResult] = await Promise.all([
      esi.fetchWithMeta<ESIClone>(`/characters/${owner.characterId}/clones`, {
        characterId: owner.characterId,
        schema: ESICloneSchema,
      }),
      esi.fetchWithMeta<number[]>(`/characters/${owner.characterId}/implants`, {
        characterId: owner.characterId,
        schema: z.array(z.number()),
      }),
      esi
        .fetchWithMeta<ESICharacterLocation>(
          `/characters/${owner.characterId}/location`,
          {
            characterId: owner.characterId,
            schema: ESICharacterLocationSchema,
          },
        )
        .catch((err: unknown) => {
          logger.warn('Failed to fetch active clone location', {
            module: 'ClonesStore',
            owner: owner.name,
            error: err,
          })
          return null
        }),
    ])
    return {
      data: {
        clones: clonesResult.data,
        activeImplants: implantsResult.data,
        activeLocation: locationResult?.data,
      },
      expiresAt: clonesResult.expiresAt,
      etag: clonesResult.etag,
    }
  },
  toOwnerData: (owner, data) => ({
    owner,
    clones: data.clones,
    activeImplants: data.activeImplants,
    activeLocation: data.activeLocation,
  }),
})

function collectLocationId(
  ids: ResolutionIds,
  locationId: number,
  locationType: 'station' | 'structure' | 'solar_system',
  characterId: number,
): void {
  if (locationType === 'structure') {
    if (!hasStructure(locationId)) {
      ids.structureToCharacter.set(locationId, characterId)
    }
  } else if (!hasLocation(locationId)) {
    ids.locationIds.add(locationId)
  }
}

registerCollector('clones', (ids: ResolutionIds) => {
  const { dataByOwner } = useClonesStore.getState()

  for (const { owner, clones, activeImplants, activeLocation } of dataByOwner) {
    for (const implantId of activeImplants) {
      if (needsTypeResolution(implantId)) {
        ids.typeIds.add(implantId)
      }
    }

    if (activeLocation?.structure_id) {
      collectLocationId(
        ids,
        activeLocation.structure_id,
        'structure',
        owner.characterId,
      )
    } else if (activeLocation?.station_id) {
      collectLocationId(
        ids,
        activeLocation.station_id,
        'station',
        owner.characterId,
      )
    } else if (activeLocation?.solar_system_id) {
      collectLocationId(
        ids,
        activeLocation.solar_system_id,
        'solar_system',
        owner.characterId,
      )
    }

    if (clones.home_location) {
      const { location_id, location_type } = clones.home_location
      collectLocationId(ids, location_id, location_type, owner.characterId)
    }

    for (const jumpClone of clones.jump_clones) {
      const { location_id, location_type } = jumpClone
      collectLocationId(ids, location_id, location_type, owner.characterId)

      for (const implantId of jumpClone.implants) {
        if (needsTypeResolution(implantId)) {
          ids.typeIds.add(implantId)
        }
      }
    }
  }
})
