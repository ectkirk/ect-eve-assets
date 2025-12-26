export const DEFAULT_CORPORATION = 'Galactic Hauling Solutions Inc.'

export const TIER_COLORS: Record<
  string,
  { bg: string; border: string; text: string; textLight: string }
> = {
  Standard: {
    bg: 'bg-semantic-success/10',
    border: 'border-semantic-success/30',
    text: 'text-status-positive',
    textLight: 'text-semantic-success',
  },
  Express: {
    bg: 'bg-status-info/10',
    border: 'border-status-info/30',
    text: 'text-status-info',
    textLight: 'text-status-info',
  },
  Priority: {
    bg: 'bg-semantic-asset-safety/10',
    border: 'border-semantic-asset-safety/30',
    text: 'text-status-time',
    textLight: 'text-semantic-asset-safety',
  },
}

const DEFAULT_TIER_COLORS = {
  bg: 'bg-surface-tertiary',
  border: 'border-border',
  text: 'text-content',
  textLight: 'text-content',
}

export function getTierColors(tierName: string) {
  return TIER_COLORS[tierName] ?? DEFAULT_TIER_COLORS
}
