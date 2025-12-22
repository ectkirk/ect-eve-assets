import { useAuthStore, type Owner } from './auth-store'
import {
  getCharacterShip,
  getCharacterLocation,
} from '@/api/endpoints/location'
import type { ESIAsset } from '@/api/endpoints/assets'
import { logger } from '@/lib/logger'

const LOCATION_SCOPES = [
  'esi-location.read_location.v1',
  'esi-location.read_ship_type.v1',
]

export interface ActiveShipResult {
  syntheticShip: ESIAsset | null
  shipName: string | null
  shipItemId: number | null
}

export async function detectAndInjectActiveShip(
  owner: Owner,
  assets: ESIAsset[],
  ownerKey: string
): Promise<ActiveShipResult> {
  const nullResult: ActiveShipResult = {
    syntheticShip: null,
    shipName: null,
    shipItemId: null,
  }

  if (owner.type !== 'character') return nullResult

  const allItemIds = new Set(assets.map((a) => a.item_id))
  const missingParentIds = new Set<number>()
  for (const asset of assets) {
    if (asset.location_type === 'item' && !allItemIds.has(asset.location_id)) {
      missingParentIds.add(asset.location_id)
    }
  }

  if (missingParentIds.size === 0) return nullResult

  const hasLocationScopes = LOCATION_SCOPES.every((scope) =>
    useAuthStore.getState().ownerHasScope(ownerKey, scope)
  )

  if (!hasLocationScopes) {
    useAuthStore.getState().setOwnerScopesOutdated(ownerKey, true)
    logger.info('Missing location scopes for active ship detection', {
      module: 'AssetStore',
      owner: owner.name,
      missingParentCount: missingParentIds.size,
    })
    return nullResult
  }

  try {
    const [shipInfo, locationInfo] = await Promise.all([
      getCharacterShip(owner.characterId),
      getCharacterLocation(owner.characterId),
    ])

    if (!missingParentIds.has(shipInfo.ship_item_id)) {
      return nullResult
    }

    const syntheticShip: ESIAsset = {
      item_id: shipInfo.ship_item_id,
      type_id: shipInfo.ship_type_id,
      location_id:
        locationInfo.structure_id ??
        locationInfo.station_id ??
        locationInfo.solar_system_id,
      location_type: locationInfo.structure_id
        ? 'other'
        : locationInfo.station_id
          ? 'station'
          : 'solar_system',
      location_flag: 'ActiveShip',
      quantity: 1,
      is_singleton: true,
    }

    logger.info('Injected active ship as synthetic asset', {
      module: 'AssetStore',
      owner: owner.name,
      shipItemId: shipInfo.ship_item_id,
      shipTypeId: shipInfo.ship_type_id,
      shipName: shipInfo.ship_name,
      locationId: syntheticShip.location_id,
      locationType: syntheticShip.location_type,
    })

    return {
      syntheticShip,
      shipName: shipInfo.ship_name,
      shipItemId: shipInfo.ship_item_id,
    }
  } catch {
    logger.warn('Failed to fetch active ship info', {
      module: 'AssetStore',
      owner: owner.name,
    })
    return nullResult
  }
}
