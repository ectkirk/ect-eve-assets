import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore, ownerKey } from './auth-store'

const MARKET_SCOPE = 'esi-ui.open_window.v1'

interface IngameDefaultsState {
  defaultMarketCharacterId: number | null
  setDefaultMarketCharacter: (characterId: number | null) => void
}

export const useIngameDefaultsStore = create<IngameDefaultsState>()(
  persist(
    (set) => ({
      defaultMarketCharacterId: null,
      setDefaultMarketCharacter: (characterId) =>
        set({ defaultMarketCharacterId: characterId }),
    }),
    { name: 'ingame-defaults' }
  )
)

export function getValidDefaultMarketCharacterId(): number | null {
  const { defaultMarketCharacterId } = useIngameDefaultsStore.getState()
  if (!defaultMarketCharacterId) return null

  const { owners, ownerHasScope } = useAuthStore.getState()
  const owner = owners[ownerKey('character', defaultMarketCharacterId)]
  if (!owner || owner.type !== 'character' || owner.authFailed) return null
  if (
    !ownerHasScope(
      ownerKey('character', defaultMarketCharacterId),
      MARKET_SCOPE
    )
  )
    return null

  return defaultMarketCharacterId
}
