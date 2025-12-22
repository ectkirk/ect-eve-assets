import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/shallow'

export const ASSET_SETTING_KEYS = [
  'includeMarketOrders',
  'includeContracts',
  'includeIndustryJobs',
  'includeActiveShip',
  'includeStructures',
] as const

export type AssetSettingKey = (typeof ASSET_SETTING_KEYS)[number]

export interface AssetSettingConfig {
  key: AssetSettingKey
  filterValue: string
  label: string
  description: string
}

export const ASSET_SETTINGS_CONFIG: AssetSettingConfig[] = [
  {
    key: 'includeMarketOrders',
    filterValue: 'MARKET_ORDERS',
    label: 'Market Orders',
    description: 'Include items from active sell orders',
  },
  {
    key: 'includeContracts',
    filterValue: 'CONTRACTS',
    label: 'Contracts',
    description: 'Include items from outstanding contracts you issued',
  },
  {
    key: 'includeIndustryJobs',
    filterValue: 'INDUSTRY_JOBS',
    label: 'Industry Jobs',
    description: 'Include items from active and ready industry jobs',
  },
  {
    key: 'includeActiveShip',
    filterValue: 'ACTIVE_SHIP',
    label: 'Active Ship',
    description: 'Include your currently piloted ship and its contents',
  },
  {
    key: 'includeStructures',
    filterValue: 'STRUCTURES',
    label: 'Structures',
    description:
      'Include owned structures (Citadels, Engineering Complexes, etc.)',
  },
]

type AssetSettingsValues = Record<AssetSettingKey, boolean>

interface AssetSettingsState extends AssetSettingsValues {
  setSetting: (key: AssetSettingKey, value: boolean) => void
}

const defaultValues: AssetSettingsValues = {
  includeMarketOrders: true,
  includeContracts: true,
  includeIndustryJobs: true,
  includeActiveShip: true,
  includeStructures: true,
}

export const useAssetSettingsStore = create<AssetSettingsState>()(
  persist(
    (set) => ({
      ...defaultValues,
      setSetting: (key, value) => set({ [key]: value }),
    }),
    { name: 'asset-settings' }
  )
)

export function useAssetSettings() {
  return useAssetSettingsStore(
    useShallow((s) => ({
      includeMarketOrders: s.includeMarketOrders,
      includeContracts: s.includeContracts,
      includeIndustryJobs: s.includeIndustryJobs,
      includeActiveShip: s.includeActiveShip,
      includeStructures: s.includeStructures,
      setSetting: s.setSetting,
    }))
  )
}
