import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore, ownerKey } from './auth-store'
import { getCharacterLocation } from '@/api/endpoints/location'
import { logger } from '@/lib/logger'

const LOCATION_SCOPE = 'esi-location.read_location.v1'

export interface CharacterLocation {
  characterId: number
  characterName: string
  systemId: number
}

interface CharacterLocationsState {
  enabled: boolean
  locations: Map<number, CharacterLocation>
  isLoading: boolean
  lastUpdated: number | null
  setEnabled: (enabled: boolean) => void
  fetchLocations: () => Promise<void>
}

export const useCharacterLocationsStore = create<CharacterLocationsState>()(
  persist(
    (set, get) => ({
      enabled: false,
      locations: new Map(),
      isLoading: false,
      lastUpdated: null,

      setEnabled: (enabled) => {
        set({ enabled })
        if (!enabled) {
          set({ locations: new Map() })
        }
      },

      fetchLocations: async () => {
        if (!get().enabled) return
        if (get().isLoading) return

        set({ isLoading: true })

        try {
          const authStore = useAuthStore.getState()
          const characters = authStore.getCharacterOwners()

          const newLocations = new Map<number, CharacterLocation>()

          await Promise.all(
            characters.map(async (owner) => {
              const key = ownerKey(owner.type, owner.id)

              if (owner.authFailed) return
              if (!authStore.ownerHasScope(key, LOCATION_SCOPE)) {
                if (!owner.scopesOutdated) {
                  authStore.setOwnerScopesOutdated(key, true)
                  logger.info('Missing location scope for character', {
                    module: 'CharacterLocations',
                    character: owner.name,
                  })
                }
                return
              }

              try {
                logger.info('Fetching character location', {
                  module: 'CharacterLocations',
                  character: owner.name,
                })
                const location = await getCharacterLocation(owner.characterId)

                newLocations.set(owner.characterId, {
                  characterId: owner.characterId,
                  characterName: owner.name,
                  systemId: location.solar_system_id,
                })
              } catch (err) {
                logger.warn('Failed to fetch location for character', {
                  character: owner.name,
                  error: err,
                })
              }
            })
          )

          set({
            locations: newLocations,
            lastUpdated: Date.now(),
          })
        } finally {
          set({ isLoading: false })
        }
      },
    }),
    {
      name: 'character-locations',
      partialize: (state) => ({ enabled: state.enabled }),
    }
  )
)
