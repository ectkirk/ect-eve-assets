export interface SecurityConfig {
  name: string
  key: string
  buyRate: number
  iskPerM3: number
  color: string
  colorForeground: string
  textColor: string
  borderColor: string
  bgColor: string
  acceptCapitals: boolean
  assetSafetyRate?: number
}

export const ASSET_SAFETY_FEE = {
  NPC_STATION: 0.005,
  NO_NPC_STATION: 0.15,
} as const

export const SECURITY_CONFIGS: Record<string, SecurityConfig> = {
  highsec: {
    name: 'High Sec',
    key: 'highsec',
    buyRate: 0.9,
    iskPerM3: 200,
    color: 'bg-semantic-success',
    colorForeground: 'text-semantic-success-foreground',
    textColor: 'text-status-positive',
    borderColor: 'border-semantic-success/30',
    bgColor: 'bg-semantic-success/20',
    acceptCapitals: false,
  },
  lowsec: {
    name: 'Low Sec',
    key: 'lowsec',
    buyRate: 0.85,
    iskPerM3: 400,
    color: 'bg-semantic-warning',
    colorForeground: 'text-semantic-warning-foreground',
    textColor: 'text-status-highlight',
    borderColor: 'border-semantic-warning/30',
    bgColor: 'bg-semantic-warning/20',
    acceptCapitals: true,
  },
  nullsec: {
    name: 'Null Sec',
    key: 'nullsec',
    buyRate: 0.8,
    iskPerM3: 600,
    color: 'bg-semantic-danger',
    colorForeground: 'text-semantic-danger-foreground',
    textColor: 'text-status-negative',
    borderColor: 'border-semantic-danger/30',
    bgColor: 'bg-semantic-danger/20',
    acceptCapitals: true,
  },
  assetsafety: {
    name: 'Asset Safety',
    key: 'assetsafety',
    buyRate: 0.8,
    iskPerM3: 600,
    color: 'bg-semantic-asset-safety',
    colorForeground: 'text-semantic-asset-safety-foreground',
    textColor: 'text-status-time',
    borderColor: 'border-semantic-asset-safety/30',
    bgColor: 'bg-semantic-asset-safety/20',
    acceptCapitals: true,
    assetSafetyRate: 0.15,
  },
}

export const BUYBACK_TABS = [
  'High Sec',
  'Low Sec',
  'Null Sec',
  'Asset Safety',
] as const

export type BuybackTabType = (typeof BUYBACK_TABS)[number]

export function getConfigByTabName(tabName: BuybackTabType): SecurityConfig | null {
  const key = tabName.toLowerCase().replace(' ', '')
  return SECURITY_CONFIGS[key] ?? null
}
