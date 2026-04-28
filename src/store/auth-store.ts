import { create } from 'zustand'
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from 'zustand/middleware'
import { logger } from '@/lib/logger'
import {
  getRecordValue,
  removeRecordValue,
  setRecordValue,
} from '@/lib/record-utils'
import type { CorporationRoles } from '../../shared/electron-api-types'

export type { CorporationRoles }

const TOKEN_EXPIRY_BUFFER_MS = 60_000

let writeQueue: Promise<void> = Promise.resolve()

const electronStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (!window.electronAPI) {
      return localStorage.getItem(name)
    }
    const data = await window.electronAPI.storageGet()
    if (data && name in data) {
      return JSON.stringify(getRecordValue(data, name))
    }
    return null
  },
  setItem: (name: string, value: string): void => {
    if (!window.electronAPI) {
      localStorage.setItem(name, value)
      return
    }
    writeQueue = writeQueue
      .then(async () => {
        const existing = (await window.electronAPI!.storageGet()) ?? {}
        await window.electronAPI!.storageSet(
          setRecordValue(existing, name, JSON.parse(value) as unknown),
        )
      })
      .catch((err) => {
        logger.error('Failed to write auth storage item', err, {
          module: 'AuthStorage',
          key: name,
        })
      })
  },
  removeItem: (name: string): void => {
    if (!window.electronAPI) {
      localStorage.removeItem(name)
      return
    }
    writeQueue = writeQueue
      .then(async () => {
        const existing = (await window.electronAPI!.storageGet()) ?? {}
        await window.electronAPI!.storageSet(removeRecordValue(existing, name))
      })
      .catch((err) => {
        logger.error('Failed to remove auth storage item', err, {
          module: 'AuthStorage',
          key: name,
        })
      })
  },
}

export type OwnerType = 'character' | 'corporation'

export interface Owner {
  id: number
  type: OwnerType
  name: string
  characterId: number
  corporationId: number
  allianceId?: number | undefined
  accessToken: string | null
  refreshToken: string
  expiresAt: number | null
  scopes?: string[] | undefined
  corporationRoles?: CorporationRoles | null | undefined
  authFailed?: boolean | undefined
  scopesOutdated?: boolean | undefined
}

export function ownerKey(type: OwnerType, id: number): string {
  return `${type}-${id}`
}

// Legacy alias for compatibility
export type CharacterAuth = Owner

interface AuthState {
  owners: Record<string, Owner>
  selectedOwnerIds: string[]
  isAuthenticated: boolean

  addOwner: (auth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scopes?: string[] | undefined
    corporationRoles?: CorporationRoles | null | undefined
    owner: {
      id: number
      type: OwnerType
      name: string
      characterId: number
      corporationId: number
      allianceId?: number | undefined
    }
  }) => void
  removeOwner: (ownerId: string) => void
  toggleOwnerSelection: (ownerId: string) => void
  selectAllOwners: () => void
  deselectAllOwners: () => void
  isOwnerSelected: (ownerId: string) => boolean
  updateOwnerTokens: (
    ownerId: string,
    tokens: {
      accessToken: string
      refreshToken: string
      expiresAt: number
      scopes?: string[] | undefined
    },
  ) => void
  setOwnerAuthFailed: (ownerId: string, failed: boolean) => void
  setOwnerScopesOutdated: (ownerId: string, outdated: boolean) => void
  updateOwnerRoles: (ownerId: string, roles: CorporationRoles) => void
  updateOwnerCorporationId: (ownerId: string, corporationId: number) => void
  clearAuth: () => void

  getActiveOwner: () => Owner | null
  hasOwnerAuthFailed: (ownerId: string) => boolean
  hasOwnerScopesOutdated: (ownerId: string) => boolean
  ownerHasScope: (ownerId: string, scope: string) => boolean
  ownerHasDirectorRole: (ownerId: string) => boolean
  getOwner: (ownerId: string) => Owner | null
  getOwnerByCharacterId: (characterId: number) => Owner | null
  getAllOwners: () => Owner[]
  getCharacterOwners: () => Owner[]
  getCorporationOwners: () => Owner[]
  isOwnerTokenExpired: (ownerId: string) => boolean

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
    tokens: { accessToken: string; refreshToken: string; expiresAt: number },
  ) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      owners: {},
      selectedOwnerIds: [],
      isAuthenticated: false,

      addOwner: ({
        accessToken,
        refreshToken,
        expiresAt,
        scopes,
        corporationRoles,
        owner,
      }) => {
        const key = ownerKey(owner.type, owner.id)
        set((state) => {
          const newOwners = setRecordValue(state.owners, key, {
            id: owner.id,
            type: owner.type,
            name: owner.name,
            characterId: owner.characterId,
            corporationId: owner.corporationId,
            allianceId: owner.allianceId,
            accessToken,
            refreshToken,
            expiresAt,
            scopes,
            corporationRoles,
          })
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
          const remaining = removeRecordValue(state.owners, ownerId)
          return {
            owners: remaining,
            selectedOwnerIds: state.selectedOwnerIds.filter(
              (id) => id !== ownerId,
            ),
            isAuthenticated: Object.keys(remaining).length > 0,
          }
        })
      },

      toggleOwnerSelection: (ownerId) => {
        const { owners, selectedOwnerIds } = get()
        if (!getRecordValue(owners, ownerId)) return
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

      updateOwnerTokens: (
        ownerId,
        { accessToken, refreshToken, expiresAt, scopes },
      ) => {
        set((state) => {
          const owner = getRecordValue(state.owners, ownerId)
          if (!owner) return state
          return {
            owners: setRecordValue(state.owners, ownerId, {
              ...owner,
              accessToken,
              refreshToken,
              expiresAt,
              scopes: scopes ?? owner.scopes,
              authFailed: false,
              scopesOutdated: false,
            }),
          }
        })
      },

      setOwnerAuthFailed: (ownerId, failed) => {
        set((state) => {
          const owner = getRecordValue(state.owners, ownerId)
          if (!owner) return state
          return {
            owners: setRecordValue(state.owners, ownerId, {
              ...owner,
              authFailed: failed,
            }),
          }
        })
      },

      setOwnerScopesOutdated: (ownerId, outdated) => {
        set((state) => {
          const owner = getRecordValue(state.owners, ownerId)
          if (!owner) return state
          return {
            owners: setRecordValue(state.owners, ownerId, {
              ...owner,
              scopesOutdated: outdated,
            }),
          }
        })
      },

      updateOwnerRoles: (ownerId, roles) => {
        set((state) => {
          const owner = getRecordValue(state.owners, ownerId)
          if (!owner) return state
          return {
            owners: setRecordValue(state.owners, ownerId, {
              ...owner,
              corporationRoles: roles,
            }),
          }
        })
      },

      updateOwnerCorporationId: (ownerId, corporationId) => {
        set((state) => {
          const owner = getRecordValue(state.owners, ownerId)
          if (!owner) return state
          return {
            owners: setRecordValue(state.owners, ownerId, {
              ...owner,
              corporationId,
            }),
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
        const firstId = selectedOwnerIds.at(0)
        if (!firstId) return null
        return getRecordValue(owners, firstId) ?? null
      },

      hasOwnerAuthFailed: (ownerId) => {
        const owner = getRecordValue(get().owners, ownerId)
        return owner?.authFailed === true
      },

      hasOwnerScopesOutdated: (ownerId) => {
        const owner = getRecordValue(get().owners, ownerId)
        return owner?.scopesOutdated === true
      },

      ownerHasScope: (ownerId, scope) => {
        const owner = getRecordValue(get().owners, ownerId)
        if (!owner?.scopes) return false
        return owner.scopes.includes(scope)
      },

      ownerHasDirectorRole: (ownerId) => {
        const owner = getRecordValue(get().owners, ownerId)
        return owner?.corporationRoles?.roles?.includes('Director') ?? false
      },

      getOwner: (ownerId) => {
        return getRecordValue(get().owners, ownerId) ?? null
      },

      getOwnerByCharacterId: (characterId) => {
        const { owners } = get()
        return (
          Object.values(owners).find((o) => o.characterId === characterId) ??
          null
        )
      },

      getAllOwners: () => {
        return Object.values(get().owners)
      },

      getCharacterOwners: () => {
        return Object.values(get().owners).filter((o) => o.type === 'character')
      },

      getCorporationOwners: () => {
        return Object.values(get().owners).filter(
          (o) => o.type === 'corporation',
        )
      },

      isOwnerTokenExpired: (ownerId) => {
        const owner = getRecordValue(get().owners, ownerId)
        if (!owner?.expiresAt) return true
        return Date.now() >= owner.expiresAt - TOKEN_EXPIRY_BUFFER_MS
      },

      // Legacy compatibility - computed getters
      get characters() {
        const { owners } = get()
        return Object.fromEntries(
          Object.values(owners)
            .filter((owner) => owner.type === 'character')
            .map((owner) => [owner.id, owner]),
        )
      },

      get activeCharacterId() {
        const { selectedOwnerIds, owners } = get()
        const firstId = selectedOwnerIds.at(0)
        if (!firstId) return null
        const owner = getRecordValue(owners, firstId)
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
              allianceId: owner.allianceId,
              refreshToken: owner.refreshToken,
              scopes: owner.scopes,
              corporationRoles: owner.corporationRoles,
              scopesOutdated: owner.scopesOutdated,
              accessToken: null,
              expiresAt: null,
            },
          ]),
        ),
        selectedOwnerIds: state.selectedOwnerIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = Object.keys(state.owners).length > 0
          // Migration: handle old activeOwnerId format
          const rawState = state as AuthState & {
            activeOwnerId?: string | null
          }
          if ('activeOwnerId' in rawState && !state.selectedOwnerIds?.length) {
            const ownerKeys = Object.keys(state.owners)
            if (rawState.activeOwnerId === null) {
              state.selectedOwnerIds = ownerKeys
            } else if (
              rawState.activeOwnerId &&
              ownerKeys.includes(rawState.activeOwnerId)
            ) {
              state.selectedOwnerIds = [rawState.activeOwnerId]
            } else {
              state.selectedOwnerIds = ownerKeys
            }
            delete rawState.activeOwnerId
          }
        }
      },
    },
  ),
)

// Hook to get first selected character (legacy compatibility)
export function useActiveCharacter() {
  const owners = useAuthStore((state) => state.owners)
  const selectedOwnerIds = useAuthStore((state) => state.selectedOwnerIds)
  const firstId = selectedOwnerIds.at(0)
  if (!firstId) return null
  const owner = getRecordValue(owners, firstId)
  return owner?.type === 'character' ? owner : null
}

export function findOwnerByKey(ownerKeyStr: string): Owner | undefined {
  return getRecordValue(useAuthStore.getState().owners, ownerKeyStr)
}
