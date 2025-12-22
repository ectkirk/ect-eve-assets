export interface SecurityStyling {
  color: string
  colorForeground: string
  textColor: string
  borderColor: string
  bgColor: string
}

type SecurityKey = 'highsec' | 'lowsec' | 'nullsec' | 'assetsafety'

const SECURITY_STYLING: Record<SecurityKey, SecurityStyling> = {
  highsec: {
    color: 'bg-semantic-success',
    colorForeground: 'text-semantic-success-foreground',
    textColor: 'text-status-positive',
    borderColor: 'border-semantic-success/30',
    bgColor: 'bg-semantic-success/20',
  },
  lowsec: {
    color: 'bg-semantic-warning',
    colorForeground: 'text-semantic-warning-foreground',
    textColor: 'text-status-highlight',
    borderColor: 'border-semantic-warning/30',
    bgColor: 'bg-semantic-warning/20',
  },
  nullsec: {
    color: 'bg-semantic-danger',
    colorForeground: 'text-semantic-danger-foreground',
    textColor: 'text-status-negative',
    borderColor: 'border-semantic-danger/30',
    bgColor: 'bg-semantic-danger/20',
  },
  assetsafety: {
    color: 'bg-semantic-asset-safety',
    colorForeground: 'text-semantic-asset-safety-foreground',
    textColor: 'text-status-time',
    borderColor: 'border-semantic-asset-safety/30',
    bgColor: 'bg-semantic-asset-safety/20',
  },
}

export const BUYBACK_TABS = [
  'High Sec',
  'Low Sec',
  'Null Sec',
  'Asset Safety',
] as const

export type BuybackTabType = (typeof BUYBACK_TABS)[number]

export type AssetSafetySecurityLevel = 'highsec' | 'lowsec' | 'nullsec'

export function tabToKey(tab: BuybackTabType): string {
  return tab.toLowerCase().replace(' ', '')
}

export function formatPercent(rate: number): string {
  const pct = rate * 100
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`
}

export interface RuntimeSecurityConfig {
  name: string
  key: string
  buyRate: number
  iskPerM3: number
  acceptCapitals: boolean
  assetSafetyRate?: number
  styling: SecurityStyling
}

function isSecurityKey(key: string): key is SecurityKey {
  return key in SECURITY_STYLING
}

export function getStyling(key: string): SecurityStyling {
  return isSecurityKey(key) ? SECURITY_STYLING[key] : SECURITY_STYLING.highsec
}
