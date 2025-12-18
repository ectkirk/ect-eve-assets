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

export const ASSET_SAFETY_RATES = {
  highsec: { noNpc: 0.85, npc: 0.875, iskPerM3: 200 },
  lowsec: { noNpc: 0.8, npc: 0.825, iskPerM3: 400 },
  nullsec: { noNpc: 0.75, npc: 0.775, iskPerM3: 600 },
  FEE_RATE: 0.15,
  NPC_STATION_FEE_RATE: 0.005,
} as const

export type AssetSafetySecurityLevel = 'highsec' | 'lowsec' | 'nullsec'

export function formatPercent(rate: number): string {
  const pct = rate * 100
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`
}

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
    buyRate: ASSET_SAFETY_RATES.nullsec.noNpc,
    iskPerM3: ASSET_SAFETY_RATES.nullsec.iskPerM3,
    color: 'bg-semantic-asset-safety',
    colorForeground: 'text-semantic-asset-safety-foreground',
    textColor: 'text-status-time',
    borderColor: 'border-semantic-asset-safety/30',
    bgColor: 'bg-semantic-asset-safety/20',
    acceptCapitals: true,
    assetSafetyRate: ASSET_SAFETY_RATES.FEE_RATE,
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
