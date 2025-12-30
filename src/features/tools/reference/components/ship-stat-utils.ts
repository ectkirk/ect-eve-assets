import type { ShipSlots } from '@/lib/fitting-utils'

export const SHIP_STAT_ATTRS = {
  hiSlots: 14,
  medSlots: 13,
  lowSlots: 12,
  rigSlots: 1137,
  rigSlotsLeft: 1154,
  turretHardpoints: 102,
  launcherHardpoints: 101,
  subsystemSlots: 1367,

  cpuOutput: 48,
  powerOutput: 11,
  calibration: 1132,

  capacitorCapacity: 482,
  capacitorRechargeTime: 55,

  maxTargetRange: 76,
  maxLockedTargets: 192,
  scanResolution: 564,
  signatureRadius: 552,
  scanRadarStrength: 208,
  scanLadarStrength: 209,
  scanMagnetometricStrength: 210,
  scanGravimetricStrength: 211,

  maxVelocity: 37,
  agility: 70,
  warpSpeed: 1281,

  droneCapacity: 283,
  droneBandwidth: 1271,
} as const

export function extractShipSlots(attrMap: Map<number, number>): ShipSlots {
  return {
    high: attrMap.get(SHIP_STAT_ATTRS.hiSlots) ?? 0,
    mid: attrMap.get(SHIP_STAT_ATTRS.medSlots) ?? 0,
    low: attrMap.get(SHIP_STAT_ATTRS.lowSlots) ?? 0,
    rig: attrMap.get(SHIP_STAT_ATTRS.rigSlots) ?? 0,
    subsystem: Math.min(attrMap.get(SHIP_STAT_ATTRS.subsystemSlots) ?? 0, 4),
    launcher: attrMap.get(SHIP_STAT_ATTRS.launcherHardpoints) ?? 0,
    turret: attrMap.get(SHIP_STAT_ATTRS.turretHardpoints) ?? 0,
  }
}

export function buildAttrMap(
  attributes: Array<{ value: number; attributeID: number }> | undefined
): Map<number, number> {
  const map = new Map<number, number>()
  if (!attributes) return map
  for (const attr of attributes) {
    map.set(attr.attributeID, attr.value)
  }
  return map
}
