export const LOW_FUEL_THRESHOLD_HOURS = 72
export const LOW_FUEL_THRESHOLD_DAYS = 3

export const FUEL_BLOCK_TYPE_IDS = new Set([4051, 4246, 4247, 4312])
export const STRONTIUM_TYPE_ID = 16275

export const STRUCTURE_CATEGORY_ID = 65

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
  anchor_vulnerable: { label: 'Anchor Vulnerable', color: 'text-status-highlight' },
  deploy_vulnerable: { label: 'Deploy Vulnerable', color: 'text-status-highlight' },
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
