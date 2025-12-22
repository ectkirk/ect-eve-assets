import type { TreeNode } from './tree-types'
import { getType } from '@/store/reference-cache'

export interface ModuleItem {
  type_id: number
  type_name: string
  quantity: number
}

export interface ShipSlots {
  high: number
  mid: number
  low: number
  rig: number
  subsystem: number
}

export interface ExtractedFitting {
  shipTypeId: number
  shipTypeName: string
  shipName: string
  shipGroupId?: number
  highSlotModules: ModuleItem[]
  midSlotModules: ModuleItem[]
  lowSlotModules: ModuleItem[]
  rigModules: ModuleItem[]
  subsystemModules: ModuleItem[]
  drones: ModuleItem[]
  fighterTubes: ModuleItem[]
  fighterBay: ModuleItem[]
  holds: ShipHolds
}

export interface ShipHolds {
  cargo: ModuleItem[]
  fleetHangar: ModuleItem[]
  shipHangar: ModuleItem[]
  fuelBay: ModuleItem[]
  oreBay: ModuleItem[]
  gasBay: ModuleItem[]
  mineralBay: ModuleItem[]
  salvageBay: ModuleItem[]
  shipBay: ModuleItem[]
  smallShipBay: ModuleItem[]
  mediumShipBay: ModuleItem[]
  largeShipBay: ModuleItem[]
  industrialShipBay: ModuleItem[]
  ammoBay: ModuleItem[]
  commandCenterBay: ModuleItem[]
  planetaryBay: ModuleItem[]
  materialBay: ModuleItem[]
  asteroidBay: ModuleItem[]
  iceBay: ModuleItem[]
  boosterBay: ModuleItem[]
  corpseBay: ModuleItem[]
  frigateEscapeBay: ModuleItem[]
  subsystemBay: ModuleItem[]
  mobileDepotBay: ModuleItem[]
  moonMaterialBay: ModuleItem[]
  quafeBay: ModuleItem[]
  structureDeedBay: ModuleItem[]
  expeditionBay: ModuleItem[]
}

const STRATEGIC_CRUISER_GROUP_ID = 963

export function isStrategicCruiser(groupId?: number): boolean {
  return groupId === STRATEGIC_CRUISER_GROUP_ID
}

export function countFilledSlots(modules: ModuleItem[]): number {
  return modules.filter((m) => m.type_id > 0).length
}

const SLOT_FLAG_PATTERNS = {
  high: /^HiSlot(\d)$/,
  mid: /^MedSlot(\d)$/,
  low: /^LoSlot(\d)$/,
  rig: /^RigSlot(\d)$/,
  subsystem: /^SubSystemSlot(\d)$/,
  fighterTube: /^FighterTube(\d)$/,
}

function getSlotIndex(flag: string | undefined, pattern: RegExp): number {
  if (!flag) return -1
  const match = flag.match(pattern)
  return match?.[1] ? parseInt(match[1], 10) : -1
}

function extractModulesFromChildren(
  children: TreeNode[],
  pattern: RegExp
): ModuleItem[] {
  const slotMap = new Map<number, ModuleItem>()

  for (const child of children) {
    const typeId = child.typeId
    if (!typeId) continue

    const type = getType(typeId)
    const moduleItem: ModuleItem = {
      type_id: typeId,
      type_name: type?.name ?? child.typeName ?? `Type ${typeId}`,
      quantity: 1,
    }

    // Check stackedAssets first - these contain individual assets with their original flags
    const assets = child.stackedAssets ?? (child.asset ? [child.asset] : [])

    for (const asset of assets) {
      const slotIndex = getSlotIndex(asset.location_flag, pattern)
      if (slotIndex !== -1) {
        slotMap.set(slotIndex, moduleItem)
      }
    }
  }

  const maxSlot = Math.max(...slotMap.keys(), -1)
  const modules: ModuleItem[] = []
  for (let i = 0; i <= maxSlot; i++) {
    modules.push(slotMap.get(i) ?? { type_id: 0, type_name: '', quantity: 0 })
  }

  return modules
}

function extractDrones(children: TreeNode[]): ModuleItem[] {
  const drones: ModuleItem[] = []

  for (const child of children) {
    const flag = child.asset?.location_flag
    if (flag !== 'DroneBay') continue

    const typeId = child.typeId
    if (!typeId) continue

    const type = getType(typeId)
    drones.push({
      type_id: typeId,
      type_name: type?.name ?? child.typeName ?? `Type ${typeId}`,
      quantity: child.quantity ?? 1,
    })
  }

  return drones
}

const HOLD_FLAG_MAP: Record<keyof ShipHolds, string> = {
  cargo: 'Cargo',
  fleetHangar: 'FleetHangar',
  shipHangar: 'ShipHangar',
  fuelBay: 'SpecializedFuelBay',
  oreBay: 'SpecializedOreHold',
  gasBay: 'SpecializedGasHold',
  mineralBay: 'SpecializedMineralHold',
  salvageBay: 'SpecializedSalvageHold',
  shipBay: 'SpecializedShipHold',
  smallShipBay: 'SpecializedSmallShipHold',
  mediumShipBay: 'SpecializedMediumShipHold',
  largeShipBay: 'SpecializedLargeShipHold',
  industrialShipBay: 'SpecializedIndustrialShipHold',
  ammoBay: 'SpecializedAmmoHold',
  commandCenterBay: 'SpecializedCommandCenterHold',
  planetaryBay: 'SpecializedPlanetaryCommoditiesHold',
  materialBay: 'SpecializedMaterialBay',
  asteroidBay: 'SpecializedAsteroidHold',
  iceBay: 'SpecializedIceHold',
  boosterBay: 'BoosterBay',
  corpseBay: 'CorpseBay',
  frigateEscapeBay: 'FrigateEscapeBay',
  subsystemBay: 'SubSystemBay',
  mobileDepotBay: 'MobileDepotHold',
  moonMaterialBay: 'MoonMaterialBay',
  quafeBay: 'QuafeBay',
  structureDeedBay: 'StructureDeedBay',
  expeditionBay: 'ExpeditionHold',
}

export const HOLD_LABELS: Record<keyof ShipHolds, string> = {
  cargo: 'Cargo',
  fleetHangar: 'Fleet Hangar',
  shipHangar: 'Ship Hangar',
  fuelBay: 'Fuel Bay',
  oreBay: 'Ore Hold',
  gasBay: 'Gas Hold',
  mineralBay: 'Mineral Hold',
  salvageBay: 'Salvage Hold',
  shipBay: 'Ship Hold',
  smallShipBay: 'Small Ship Bay',
  mediumShipBay: 'Medium Ship Bay',
  largeShipBay: 'Large Ship Bay',
  industrialShipBay: 'Industrial Ship Bay',
  ammoBay: 'Ammo Hold',
  commandCenterBay: 'Command Center Hold',
  planetaryBay: 'Planetary Commodities Hold',
  materialBay: 'Material Bay',
  asteroidBay: 'Asteroid Hold',
  iceBay: 'Ice Hold',
  boosterBay: 'Booster Bay',
  corpseBay: 'Corpse Bay',
  frigateEscapeBay: 'Frigate Escape Bay',
  subsystemBay: 'Subsystem Bay',
  mobileDepotBay: 'Mobile Depot Hold',
  moonMaterialBay: 'Moon Material Bay',
  quafeBay: 'Quafe Bay',
  structureDeedBay: 'Structure Deed Bay',
  expeditionBay: 'Expedition Hold',
}

function extractItemsByFlag(
  children: TreeNode[],
  targetFlag: string
): ModuleItem[] {
  const items: ModuleItem[] = []

  for (const child of children) {
    const flag = child.asset?.location_flag
    if (flag !== targetFlag) continue

    const typeId = child.typeId
    if (!typeId) continue

    const type = getType(typeId)
    items.push({
      type_id: typeId,
      type_name: type?.name ?? child.typeName ?? `Type ${typeId}`,
      quantity: child.quantity ?? 1,
    })
  }

  return items
}

function extractShipHolds(children: TreeNode[]): ShipHolds {
  const holds = {} as ShipHolds
  for (const key of Object.keys(HOLD_FLAG_MAP) as (keyof ShipHolds)[]) {
    holds[key] = extractItemsByFlag(children, HOLD_FLAG_MAP[key])
  }
  return holds
}

function extractFighterTubes(children: TreeNode[]): ModuleItem[] {
  const tubes: ModuleItem[] = []

  for (const child of children) {
    const flag = child.asset?.location_flag
    if (!flag || !SLOT_FLAG_PATTERNS.fighterTube.test(flag)) continue

    const typeId = child.typeId
    if (!typeId) continue

    const type = getType(typeId)
    tubes.push({
      type_id: typeId,
      type_name: type?.name ?? child.typeName ?? `Type ${typeId}`,
      quantity: child.quantity ?? 1,
    })
  }

  return tubes
}

function extractFittingName(fullName: string, typeName: string): string {
  const pattern = new RegExp(`^${typeName}\\s*\\((.+)\\)$`)
  const match = fullName.match(pattern)
  return match?.[1] ?? fullName
}

export function extractFitting(shipNode: TreeNode): ExtractedFitting {
  const children = shipNode.children
  const shipType = shipNode.typeId ? getType(shipNode.typeId) : undefined
  const shipTypeName = shipType?.name ?? shipNode.typeName ?? shipNode.name
  const fittingName = extractFittingName(shipNode.name, shipTypeName)

  return {
    shipTypeId: shipNode.typeId ?? 0,
    shipTypeName,
    shipName: fittingName,
    shipGroupId: shipType?.groupId,
    highSlotModules: extractModulesFromChildren(
      children,
      SLOT_FLAG_PATTERNS.high
    ),
    midSlotModules: extractModulesFromChildren(
      children,
      SLOT_FLAG_PATTERNS.mid
    ),
    lowSlotModules: extractModulesFromChildren(
      children,
      SLOT_FLAG_PATTERNS.low
    ),
    rigModules: extractModulesFromChildren(children, SLOT_FLAG_PATTERNS.rig),
    subsystemModules: extractModulesFromChildren(
      children,
      SLOT_FLAG_PATTERNS.subsystem
    ),
    drones: extractDrones(children),
    fighterTubes: extractFighterTubes(children),
    fighterBay: extractItemsByFlag(children, 'FighterBay'),
    holds: extractShipHolds(children),
  }
}

export async function fetchShipSlots(
  shipTypeId: number
): Promise<ShipSlots | null> {
  try {
    const result = await window.electronAPI?.refShipSlots([shipTypeId])
    if (!result || 'error' in result) return null

    const ship = result.ships?.[shipTypeId]
    if (!ship?.slots) return null

    return {
      high: ship.slots.high ?? 0,
      mid: ship.slots.mid ?? 0,
      low: ship.slots.low ?? 0,
      rig: ship.slots.rig ?? 0,
      subsystem: ship.slots.subsystem ?? 0,
    }
  } catch {
    return null
  }
}
