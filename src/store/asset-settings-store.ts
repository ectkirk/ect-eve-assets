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
  labelKey: string
  descriptionKey: string
}

export const ASSET_SETTINGS_CONFIG: AssetSettingConfig[] = [
  {
    key: 'includeMarketOrders',
    filterValue: 'MARKET_ORDERS',
    labelKey: 'assetSettings.marketOrders',
    descriptionKey: 'assetSettings.marketOrdersDesc',
  },
  {
    key: 'includeContracts',
    filterValue: 'CONTRACTS',
    labelKey: 'assetSettings.contracts',
    descriptionKey: 'assetSettings.contractsDesc',
  },
  {
    key: 'includeIndustryJobs',
    filterValue: 'INDUSTRY_JOBS',
    labelKey: 'assetSettings.industryJobs',
    descriptionKey: 'assetSettings.industryJobsDesc',
  },
  {
    key: 'includeActiveShip',
    filterValue: 'ACTIVE_SHIP',
    labelKey: 'assetSettings.activeShip',
    descriptionKey: 'assetSettings.activeShipDesc',
  },
  {
    key: 'includeStructures',
    filterValue: 'STRUCTURES',
    labelKey: 'assetSettings.structures',
    descriptionKey: 'assetSettings.structuresDesc',
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
