import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getIncursions } from '@/api/endpoints/incursions'
import { logger } from '@/lib/logger'

export interface IncursionInfo {
  constellationId: number
  stagingSystemId: number
  state: 'withdrawing' | 'mobilizing' | 'established'
  influence: number
  hasBoss: boolean
  systemCount: number
}

interface IncursionsState {
  enabled: boolean
  infestedSystems: Set<number>
  incursions: IncursionInfo[]
  isLoading: boolean
  lastUpdated: number | null
  setEnabled: (enabled: boolean) => void
  fetchIncursions: () => Promise<void>
  isSystemInIncursion: (systemId: number) => boolean
}

export const useIncursionsStore = create<IncursionsState>()(
  persist(
    (set, get) => ({
      enabled: false,
      infestedSystems: new Set(),
      incursions: [],
      isLoading: false,
      lastUpdated: null,

      setEnabled: (enabled) => {
        set({ enabled })
        if (!enabled) {
          set({ infestedSystems: new Set(), incursions: [] })
        }
      },

      fetchIncursions: async () => {
        if (!get().enabled) return
        if (get().isLoading) return

        set({ isLoading: true })

        try {
          logger.info('Fetching incursions', { module: 'Incursions' })
          const rawIncursions = await getIncursions()

          const infestedSystems = new Set<number>()
          const incursions: IncursionInfo[] = []

          for (const inc of rawIncursions) {
            for (const systemId of inc.infested_solar_systems) {
              infestedSystems.add(systemId)
            }
            incursions.push({
              constellationId: inc.constellation_id,
              stagingSystemId: inc.staging_solar_system_id,
              state: inc.state,
              influence: inc.influence,
              hasBoss: inc.has_boss,
              systemCount: inc.infested_solar_systems.length,
            })
          }

          incursions.sort((a, b) => b.influence - a.influence)

          logger.info('Incursions loaded', {
            module: 'Incursions',
            count: incursions.length,
            infestedCount: infestedSystems.size,
          })

          set({
            infestedSystems,
            incursions,
            lastUpdated: Date.now(),
          })
        } catch (err) {
          logger.warn('Failed to fetch incursions', {
            module: 'Incursions',
            error: err,
          })
        } finally {
          set({ isLoading: false })
        }
      },

      isSystemInIncursion: (systemId) => {
        return get().infestedSystems.has(systemId)
      },
    }),
    {
      name: 'incursions',
      partialize: (state) => ({ enabled: state.enabled }),
    }
  )
)
