import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getInsurgencies } from '@/api/endpoints/insurgencies'
import { logger } from '@/lib/logger'

export const INSURGENCIES_REFRESH_INTERVAL_MS = 60 * 60 * 1000

export interface InsurgencySystemInfo {
  id: number
  name: string
  security: number
  corruptionState: number
}

interface InsurgenciesState {
  enabled: boolean
  affectedSystems: Set<number>
  systemsInfo: InsurgencySystemInfo[]
  isLoading: boolean
  lastUpdated: number | null
  setEnabled: (enabled: boolean) => void
  fetchInsurgencies: () => Promise<void>
  isSystemInInsurgency: (systemId: number) => boolean
}

export const useInsurgenciesStore = create<InsurgenciesState>()(
  persist(
    (set, get) => ({
      enabled: false,
      affectedSystems: new Set(),
      systemsInfo: [],
      isLoading: false,
      lastUpdated: null,

      setEnabled: (enabled) => {
        set({ enabled })
        if (!enabled) {
          set({ affectedSystems: new Set(), systemsInfo: [] })
        }
      },

      fetchInsurgencies: async () => {
        if (!get().enabled) return
        if (get().isLoading) return

        const lastUpdated = get().lastUpdated
        if (
          lastUpdated &&
          Date.now() - lastUpdated < INSURGENCIES_REFRESH_INTERVAL_MS
        ) {
          return
        }

        set({ isLoading: true })

        try {
          logger.info('Fetching insurgencies', { module: 'Insurgencies' })
          const campaigns = await getInsurgencies()

          const affectedSystems = new Set<number>()
          const systemsInfo: InsurgencySystemInfo[] = []

          for (const campaign of campaigns) {
            for (const insurgency of campaign.insurgencies) {
              systemsInfo.push({
                id: insurgency.solarSystem.id,
                name: insurgency.solarSystem.name,
                security: insurgency.solarSystem.security,
                corruptionState: insurgency.corruptionState,
              })
              if (insurgency.corruptionState === 5) {
                affectedSystems.add(insurgency.solarSystem.id)
              }
            }
          }

          systemsInfo.sort((a, b) => b.corruptionState - a.corruptionState)

          logger.info('Insurgencies loaded', {
            module: 'Insurgencies',
            campaigns: campaigns.length,
            affectedCount: affectedSystems.size,
          })

          set({
            affectedSystems,
            systemsInfo,
            lastUpdated: Date.now(),
          })
        } catch (err) {
          logger.warn('Failed to fetch insurgencies', {
            module: 'Insurgencies',
            error: err,
          })
        } finally {
          set({ isLoading: false })
        }
      },

      isSystemInInsurgency: (systemId) => {
        return get().affectedSystems.has(systemId)
      },
    }),
    {
      name: 'insurgencies',
      partialize: (state) => ({ enabled: state.enabled }),
    }
  )
)
