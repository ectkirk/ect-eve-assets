import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface MapSettingsState {
  ansiblexCharacterIds: string[]
  useAnsiblexes: boolean
  addAnsiblexCharacter: (characterId: string) => void
  removeAnsiblexCharacter: (characterId: string) => void
  setUseAnsiblexes: (use: boolean) => void
}

export const useMapSettingsStore = create<MapSettingsState>()(
  persist(
    (set) => ({
      ansiblexCharacterIds: [],
      useAnsiblexes: true,
      addAnsiblexCharacter: (characterId) =>
        set((s) => ({
          ansiblexCharacterIds: s.ansiblexCharacterIds.includes(characterId)
            ? s.ansiblexCharacterIds
            : [...s.ansiblexCharacterIds, characterId],
        })),
      removeAnsiblexCharacter: (characterId) =>
        set((s) => ({
          ansiblexCharacterIds: s.ansiblexCharacterIds.filter(
            (id) => id !== characterId
          ),
        })),
      setUseAnsiblexes: (use) => set({ useAnsiblexes: use }),
    }),
    { name: 'map-settings' }
  )
)
