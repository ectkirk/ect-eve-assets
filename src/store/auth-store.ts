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
  scopes?: string[]
  authFailed?: boolean
  scopesOutdated?: boolean
}

// Helper to create owner key
export function ownerKey(type: OwnerType, id: number): string {
  return `${type}-${id}`
}

// Legacy alias for compatibility
export type CharacterAuth = Owner

interface AuthState {
  owners: Record<string, Owner>
  selectedOwnerIds: string[]
  isAuthenticated: boolean

  // Actions
  addOwner: (auth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scopes?: string[]
    owner: {
      id: number
      type: OwnerType
      name: string
      characterId: number
      corporationId: number
    }
  }) => void
  removeOwner: (ownerId: string) => void
  toggleOwnerSelection: (ownerId: string) => void
  selectAllOwners: () => void
  deselectAllOwners: () => void
  isOwnerSelected: (ownerId: string) => boolean
  updateOwnerTokens: (
    ownerId: string,
    tokens: { accessToken: string; refreshToken: string; expiresAt: number; scopes?: string[] }
  ) => void
  setOwnerAuthFailed: (ownerId: string, failed: boolean) => void
  clearAuth: () => void

  // Helpers
  getActiveOwner: () => Owner | null
  hasOwnerAuthFailed: (ownerId: string) => boolean
  hasOwnerScopesOutdated: (ownerId: string) => boolean
  ownerHasScope: (ownerId: string, scope: string) => boolean
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
      selectedOwnerIds: [],
      isAuthenticated: false,

      addOwner: ({ accessToken, refreshToken, expiresAt, scopes, owner }) => {
        const key = ownerKey(owner.type, owner.id)
        set((state) => {
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
              scopes,
            },
          }
          const alreadySelected = state.selectedOwnerIds.includes(key)
          return {
            owners: newOwners,
            selectedOwnerIds: alreadySelected
              ? state.selectedOwnerIds
              : [...state.selectedOwnerIds, key],
            isAuthenticated: true,
          }
        })
      },

      removeOwner: (ownerId) => {
        set((state) => {
          const { [ownerId]: _removed, ...remaining } = state.owners
          return {
            owners: remaining,
            selectedOwnerIds: state.selectedOwnerIds.filter((id) => id !== ownerId),
            isAuthenticated: Object.keys(remaining).length > 0,
          }
        })
      },

      toggleOwnerSelection: (ownerId) => {
        const { owners, selectedOwnerIds } = get()
        if (!owners[ownerId]) return
        const isSelected = selectedOwnerIds.includes(ownerId)
        set({
          selectedOwnerIds: isSelected
            ? selectedOwnerIds.filter((id) => id !== ownerId)
            : [...selectedOwnerIds, ownerId],
        })
      },

      selectAllOwners: () => {
        const { owners } = get()
        set({ selectedOwnerIds: Object.keys(owners) })
      },

      deselectAllOwners: () => {
        set({ selectedOwnerIds: [] })
      },

      isOwnerSelected: (ownerId) => {
        return get().selectedOwnerIds.includes(ownerId)
      },

      updateOwnerTokens: (ownerId, { accessToken, refreshToken, expiresAt, scopes }) => {
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
                scopes: scopes ?? owner.scopes,
                authFailed: false,
                scopesOutdated: false,
              },
            },
          }
        })
      },

      setOwnerAuthFailed: (ownerId, failed) => {
        set((state) => {
          const owner = state.owners[ownerId]
          if (!owner) return state
          return {
            owners: {
              ...state.owners,
              [ownerId]: {
                ...owner,
                authFailed: failed,
              },
            },
          }
        })
      },

      clearAuth: () => {
        set({
          owners: {},
          selectedOwnerIds: [],
          isAuthenticated: false,
        })
      },

      getActiveOwner: () => {
        const { owners, selectedOwnerIds } = get()
        const firstId = selectedOwnerIds[0]
        if (!firstId) return null
        return owners[firstId] ?? null
      },

      hasOwnerAuthFailed: (ownerId) => {
        const owner = get().owners[ownerId]
        return owner?.authFailed === true
      },

      hasOwnerScopesOutdated: (ownerId) => {
        const owner = get().owners[ownerId]
        return owner?.scopesOutdated === true
      },

      ownerHasScope: (ownerId, scope) => {
        const owner = get().owners[ownerId]
        if (!owner?.scopes) return false
        return owner.scopes.includes(scope)
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
        const { selectedOwnerIds, owners } = get()
        const firstId = selectedOwnerIds[0]
        if (!firstId) return null
        const owner = owners[firstId]
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
              scopes: owner.scopes,
              scopesOutdated: owner.scopesOutdated,
              accessToken: null,
              expiresAt: null,
            },
          ])
        ),
        selectedOwnerIds: state.selectedOwnerIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = Object.keys(state.owners).length > 0
          // Migration: handle old activeOwnerId format
          const rawState = state as AuthState & { activeOwnerId?: string | null }
          if ('activeOwnerId' in rawState && !state.selectedOwnerIds?.length) {
            const ownerKeys = Object.keys(state.owners)
            if (rawState.activeOwnerId === null) {
              state.selectedOwnerIds = ownerKeys
            } else if (rawState.activeOwnerId && ownerKeys.includes(rawState.activeOwnerId)) {
              state.selectedOwnerIds = [rawState.activeOwnerId]
            } else {
              state.selectedOwnerIds = ownerKeys
            }
            delete rawState.activeOwnerId
          }
        }
      },
    }
  )
)

// Hook to get first selected character (legacy compatibility)
export function useActiveCharacter() {
  const owners = useAuthStore((state) => state.owners)
  const selectedOwnerIds = useAuthStore((state) => state.selectedOwnerIds)
  const firstId = selectedOwnerIds[0]
  if (!firstId) return null
  const owner = owners[firstId]
  return owner?.type === 'character' ? owner : null
}

export function findOwnerByKey(ownerKeyStr: string): Owner | undefined {
  const owners = useAuthStore.getState().owners
  for (const owner of Object.values(owners)) {
    if (owner && ownerKey(owner.type, owner.id) === ownerKeyStr) {
      return owner
    }
  }
  return undefined
}
