export interface SecurityConfig {
  name: string
  key: string
  buyRate: number
  iskPerM3: number
  color: string
  textColor: string
  borderColor: string
  bgColor: string
  acceptCapitals: boolean
  assetSafetyRate?: number
}

export const SECURITY_CONFIGS: Record<string, SecurityConfig> = {
  highsec: {
    name: 'High Sec',
    key: 'highsec',
    buyRate: 0.9,
    iskPerM3: 200,
    color: 'bg-green-600',
    textColor: 'text-green-400',
    borderColor: 'border-green-600/30',
    bgColor: 'bg-green-900/20',
    acceptCapitals: false,
  },
  lowsec: {
    name: 'Low Sec',
    key: 'lowsec',
    buyRate: 0.85,
    iskPerM3: 400,
    color: 'bg-yellow-600',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-600/30',
    bgColor: 'bg-yellow-900/20',
    acceptCapitals: true,
  },
  nullsec: {
    name: 'Null Sec',
    key: 'nullsec',
    buyRate: 0.8,
    iskPerM3: 600,
    color: 'bg-red-600',
    textColor: 'text-red-400',
    borderColor: 'border-red-600/30',
    bgColor: 'bg-red-900/20',
    acceptCapitals: true,
  },
  assetsafety: {
    name: 'Asset Safety',
    key: 'assetsafety',
    buyRate: 0.8,
    iskPerM3: 600,
    color: 'bg-orange-600',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-600/30',
    bgColor: 'bg-orange-900/20',
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
