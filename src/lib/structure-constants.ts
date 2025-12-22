import type { ESIAsset } from '@/api/endpoints/assets'
import type { Owner } from '@/store/auth-store'
import { ownerKey } from '@/store/auth-store'
import { getType } from '@/store/reference-cache'
import { isFittedOrContentFlag } from '@/lib/tree-types'

export const LOW_FUEL_THRESHOLD_HOURS = 72
export const LOW_FUEL_THRESHOLD_DAYS = 3

export const FUEL_BLOCK_TYPE_IDS = new Set([4051, 4246, 4247, 4312])
export const STRONTIUM_TYPE_ID = 16275

export const STRUCTURE_CATEGORY_ID = 65
export const STARBASE_CATEGORY_ID = 23

export interface StructureAssetData {
  asset: ESIAsset
  children: ESIAsset[]
}

export interface StructureValueResult {
  structureAssetMap: Map<number, StructureAssetData>
  structureRelatedIds: Set<number>
  structuresTotal: number
}

function isOwnedStructureOrStarbase(asset: ESIAsset): boolean {
  if (asset.location_type !== 'solar_system') return false
  const type = getType(asset.type_id)
  return (
    type?.categoryId === STRUCTURE_CATEGORY_ID ||
    type?.categoryId === STARBASE_CATEGORY_ID
  )
}

export function calculateStructureValues(
  assetsByOwner: { owner: Owner; assets: ESIAsset[] }[],
  prices: Map<number, number>,
  selectedOwnerIds?: string[]
): StructureValueResult {
  const selectedSet = selectedOwnerIds ? new Set(selectedOwnerIds) : null
  const structureAssetMap = new Map<number, StructureAssetData>()
  const ownedStructureIds = new Set<number>()

  for (const { owner, assets } of assetsByOwner) {
    if (selectedSet && !selectedSet.has(ownerKey(owner.type, owner.id)))
      continue
    for (const asset of assets) {
      if (isOwnedStructureOrStarbase(asset)) {
        const children = assets.filter(
          (a) =>
            a.location_id === asset.item_id &&
            isFittedOrContentFlag(a.location_flag)
        )
        structureAssetMap.set(asset.item_id, { asset, children })
        ownedStructureIds.add(asset.item_id)
      }
    }
  }

  const structureRelatedIds = new Set<number>()
  let structuresTotal = 0
  for (const { asset, children } of structureAssetMap.values()) {
    structureRelatedIds.add(asset.item_id)
    structuresTotal += (prices.get(asset.type_id) ?? 0) * asset.quantity
    for (const child of children) {
      structureRelatedIds.add(child.item_id)
      structuresTotal += (prices.get(child.type_id) ?? 0) * child.quantity
    }
  }

  return { structureAssetMap, structureRelatedIds, structuresTotal }
}

interface StateDisplay {
  label: string
  color: string
}

export const STATE_DISPLAY: Record<string, StateDisplay> = {
  shield_vulnerable: { label: 'Online', color: 'text-status-positive' },
  armor_vulnerable: { label: 'Armor', color: 'text-status-highlight' },
  hull_vulnerable: { label: 'Hull', color: 'text-status-negative' },
  armor_reinforce: { label: 'Armor Reinforce', color: 'text-status-highlight' },
  hull_reinforce: { label: 'Hull Reinforce', color: 'text-status-negative' },
  anchoring: { label: 'Anchoring', color: 'text-status-info' },
  unanchored: { label: 'Unanchored', color: 'text-content-secondary' },
  onlining_vulnerable: { label: 'Onlining', color: 'text-status-info' },
  online_deprecated: { label: 'Online', color: 'text-status-positive' },
  anchor_vulnerable: {
    label: 'Anchor Vulnerable',
    color: 'text-status-highlight',
  },
  deploy_vulnerable: {
    label: 'Deploy Vulnerable',
    color: 'text-status-highlight',
  },
  fitting_invulnerable: { label: 'Fitting', color: 'text-status-info' },
  offline: { label: 'Offline', color: 'text-content-secondary' },
  online: { label: 'Online', color: 'text-status-positive' },
  onlining: { label: 'Onlining', color: 'text-status-info' },
  reinforced: { label: 'Reinforced', color: 'text-status-negative' },
  unanchoring: { label: 'Unanchoring', color: 'text-status-highlight' },
  unknown: { label: 'Unknown', color: 'text-content-muted' },
}

export function getStateDisplay(state: string): StateDisplay {
  return STATE_DISPLAY[state] ?? STATE_DISPLAY.unknown!
}
