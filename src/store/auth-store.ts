import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'

// Custom storage adapter using Electron IPC for reliable file-based persistence
const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (!window.electronAPI) {
      return localStorage.getItem(name)
    }
    const data = await window.electronAPI.storageGet()
    if (data && name in data) {
      return JSON.stringify(data[name])
    }
    return null
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (!window.electronAPI) {
      localStorage.setItem(name, value)
      return
    }
    const existing = (await window.electronAPI.storageGet()) ?? {}
    existing[name] = JSON.parse(value)
    await window.electronAPI.storageSet(existing)
  },
  removeItem: async (name: string): Promise<void> => {
    if (!window.electronAPI) {
      localStorage.removeItem(name)
      return
    }
    const existing = (await window.electronAPI.storageGet()) ?? {}
    delete existing[name]
    await window.electronAPI.storageSet(existing)
  },
}

export type OwnerType = 'character' | 'corporation'

export interface Owner {
  id: number // Character ID or Corporation ID
  type: OwnerType
  name: string
  // For corporations, this is the character ID with Director role
  // For characters, this is the same as id
  characterId: number
  corporationId: number
  accessToken: string | null
  refreshToken: string
  expiresAt: number | null
}

// Helper to create owner key
export function ownerKey(type: OwnerType, id: number): string {
  return `${type}-${id}`
}

// Legacy alias for compatibility
export type CharacterAuth = Owner

interface AuthState {
  owners: Record<string, Owner>
  activeOwnerId: string | null
  isAuthenticated: boolean

  // Actions
  addOwner: (auth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    owner: {
      id: number
      type: OwnerType
      name: string
      characterId: number
      corporationId: number
    }
  }) => void
  removeOwner: (ownerId: string) => void
  switchOwner: (ownerId: string | null) => void
  updateOwnerTokens: (
    ownerId: string,
    tokens: { accessToken: string; refreshToken: string; expiresAt: number }
  ) => void
  clearAuth: () => void

  // Helpers
  getActiveOwner: () => Owner | null
  getOwner: (ownerId: string) => Owner | null
  getOwnerByCharacterId: (characterId: number) => Owner | null
  getAllOwners: () => Owner[]
  getCharacterOwners: () => Owner[]
  getCorporationOwners: () => Owner[]
  isOwnerTokenExpired: (ownerId: string) => boolean

  // Legacy compatibility (computed from owners)
  characters: Record<number, Owner>
  activeCharacterId: number | null
  addCharacter: (auth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    character: { id: number; name: string; corporationId: number }
  }) => void
  removeCharacter: (characterId: number) => void
  getCharacter: (characterId: number) => Owner | null
  getAllCharacters: () => Owner[]
  isTokenExpired: (characterId: number) => boolean
  updateCharacterTokens: (
    characterId: number,
    tokens: { accessToken: string; refreshToken: string; expiresAt: number }
  ) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      owners: {},
      activeOwnerId: null,
      isAuthenticated: false,

      // New Owner-based API
      addOwner: ({ accessToken, refreshToken, expiresAt, owner }) => {
        const key = ownerKey(owner.type, owner.id)
        set((state) => {
          const hadOwners = Object.keys(state.owners).length > 0
          const newOwners = {
            ...state.owners,
            [key]: {
              id: owner.id,
              type: owner.type,
              name: owner.name,
              characterId: owner.characterId,
              corporationId: owner.corporationId,
              accessToken,
              refreshToken,
              expiresAt,
            },
          }
          return {
            owners: newOwners,
            activeOwnerId: hadOwners ? null : key,
            isAuthenticated: true,
          }
        })
      },

      removeOwner: (ownerId) => {
        set((state) => {
          const { [ownerId]: _removed, ...remaining } = state.owners
          const remainingKeys = Object.keys(remaining)
          return {
            owners: remaining,
            activeOwnerId:
              state.activeOwnerId === ownerId
                ? remainingKeys[0] ?? null
                : state.activeOwnerId,
            isAuthenticated: remainingKeys.length > 0,
          }
        })
      },

      switchOwner: (ownerId) => {
        if (ownerId === null) {
          set({ activeOwnerId: null })
          return
        }
        const { owners } = get()
        if (owners[ownerId]) {
          set({ activeOwnerId: ownerId })
        }
      },

      updateOwnerTokens: (ownerId, { accessToken, refreshToken, expiresAt }) => {
        set((state) => {
          const owner = state.owners[ownerId]
          if (!owner) return state
          return {
            owners: {
              ...state.owners,
              [ownerId]: {
                ...owner,
                accessToken,
                refreshToken,
                expiresAt,
              },
            },
          }
        })
      },

      clearAuth: () => {
        set({
          owners: {},
          activeOwnerId: null,
          isAuthenticated: false,
        })
      },

      getActiveOwner: () => {
        const { owners, activeOwnerId } = get()
        if (!activeOwnerId) return null
        return owners[activeOwnerId] ?? null
      },

      getOwner: (ownerId) => {
        return get().owners[ownerId] ?? null
      },

      getOwnerByCharacterId: (characterId) => {
        const { owners } = get()
        return Object.values(owners).find((o) => o.characterId === characterId) ?? null
      },

      getAllOwners: () => {
        return Object.values(get().owners)
      },

      getCharacterOwners: () => {
        return Object.values(get().owners).filter((o) => o.type === 'character')
      },

      getCorporationOwners: () => {
        return Object.values(get().owners).filter((o) => o.type === 'corporation')
      },

      isOwnerTokenExpired: (ownerId) => {
        const owner = get().owners[ownerId]
        if (!owner?.expiresAt) return true
        return Date.now() >= owner.expiresAt - 60000
      },

      // Legacy compatibility - computed getters
      get characters() {
        const { owners } = get()
        const chars: Record<number, Owner> = {}
        for (const owner of Object.values(owners)) {
          if (owner.type === 'character') {
            chars[owner.id] = owner
          }
        }
        return chars
      },

      get activeCharacterId() {
        const { activeOwnerId, owners } = get()
        if (!activeOwnerId) return null
        const owner = owners[activeOwnerId]
        return owner?.type === 'character' ? owner.id : null
      },

      // Legacy actions - delegate to new API
      addCharacter: ({ accessToken, refreshToken, expiresAt, character }) => {
        get().addOwner({
          accessToken,
          refreshToken,
          expiresAt,
          owner: {
            id: character.id,
            type: 'character',
            name: character.name,
            characterId: character.id,
            corporationId: character.corporationId,
          },
        })
      },

      removeCharacter: (characterId) => {
        get().removeOwner(ownerKey('character', characterId))
      },

      getCharacter: (characterId) => {
        return get().getOwner(ownerKey('character', characterId))
      },

      getAllCharacters: () => {
        return get().getCharacterOwners()
      },

      isTokenExpired: (characterId) => {
        return get().isOwnerTokenExpired(ownerKey('character', characterId))
      },

      updateCharacterTokens: (characterId, tokens) => {
        get().updateOwnerTokens(ownerKey('character', characterId), tokens)
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        owners: Object.fromEntries(
          Object.entries(state.owners).map(([key, owner]) => [
            key,
            {
              id: owner.id,
              type: owner.type,
              name: owner.name,
              characterId: owner.characterId,
              corporationId: owner.corporationId,
              refreshToken: owner.refreshToken,
              // Don't persist tokens - they'll be refreshed
              accessToken: null,
              expiresAt: null,
            },
          ])
        ),
        activeOwnerId: state.activeOwnerId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = Object.keys(state.owners).length > 0
        }
      },
    }
  )
)

// Hook to get active character (legacy compatibility)
export function useActiveCharacter() {
  const owners = useAuthStore((state) => state.owners)
  const activeOwnerId = useAuthStore((state) => state.activeOwnerId)
  if (!activeOwnerId) return null
  const owner = owners[activeOwnerId]
  return owner?.type === 'character' ? owner : null
}
