import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore, ownerKey } from './auth-store'

describe('ownerKey', () => {
  it('creates key for character', () => {
    expect(ownerKey('character', 12345)).toBe('character-12345')
  })

  it('creates key for corporation', () => {
    expect(ownerKey('corporation', 98000001)).toBe('corporation-98000001')
  })
})

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      owners: {},
      activeOwnerId: null,
      isAuthenticated: false,
    })
  })

  describe('initial state', () => {
    it('starts with no owners', () => {
      const state = useAuthStore.getState()
      expect(state.owners).toEqual({})
      expect(state.activeOwnerId).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('addOwner', () => {
    it('adds a character owner', () => {
      const { addOwner } = useAuthStore.getState()

      addOwner({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test Character',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.activeOwnerId).toBe('character-12345')
      expect(state.owners['character-12345']).toBeDefined()
      expect(state.owners['character-12345']!.name).toBe('Test Character')
    })

    it('adds a corporation owner', () => {
      const { addOwner } = useAuthStore.getState()

      addOwner({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 98000001,
          type: 'corporation',
          name: 'Test Corp',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.activeOwnerId).toBe('corporation-98000001')
      expect(state.owners['corporation-98000001']).toBeDefined()
    })

    it('sets first owner as active', () => {
      const { addOwner } = useAuthStore.getState()

      addOwner({
        accessToken: 'token1',
        refreshToken: 'refresh1',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 11111,
          type: 'character',
          name: 'First',
          characterId: 11111,
          corporationId: 98000001,
        },
      })

      addOwner({
        accessToken: 'token2',
        refreshToken: 'refresh2',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 22222,
          type: 'character',
          name: 'Second',
          characterId: 22222,
          corporationId: 98000001,
        },
      })

      const state = useAuthStore.getState()
      expect(state.activeOwnerId).toBe('character-11111')
    })
  })

  describe('removeOwner', () => {
    beforeEach(() => {
      const { addOwner } = useAuthStore.getState()
      addOwner({
        accessToken: 'token1',
        refreshToken: 'refresh1',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 11111,
          type: 'character',
          name: 'First',
          characterId: 11111,
          corporationId: 98000001,
        },
      })
      addOwner({
        accessToken: 'token2',
        refreshToken: 'refresh2',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 22222,
          type: 'character',
          name: 'Second',
          characterId: 22222,
          corporationId: 98000001,
        },
      })
    })

    it('removes an owner', () => {
      const { removeOwner } = useAuthStore.getState()
      removeOwner('character-22222')

      const state = useAuthStore.getState()
      expect(state.owners['character-22222']).toBeUndefined()
      expect(state.owners['character-11111']).toBeDefined()
    })

    it('switches active if removed owner was active', () => {
      useAuthStore.setState({ activeOwnerId: 'character-22222' })
      const { removeOwner } = useAuthStore.getState()
      removeOwner('character-22222')

      const state = useAuthStore.getState()
      expect(state.activeOwnerId).toBe('character-11111')
    })

    it('sets isAuthenticated false when last owner removed', () => {
      const { removeOwner } = useAuthStore.getState()
      removeOwner('character-11111')
      removeOwner('character-22222')

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.activeOwnerId).toBeNull()
    })
  })

  describe('switchOwner', () => {
    beforeEach(() => {
      const { addOwner } = useAuthStore.getState()
      addOwner({
        accessToken: 'token1',
        refreshToken: 'refresh1',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 11111,
          type: 'character',
          name: 'First',
          characterId: 11111,
          corporationId: 98000001,
        },
      })
      addOwner({
        accessToken: 'token2',
        refreshToken: 'refresh2',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 22222,
          type: 'character',
          name: 'Second',
          characterId: 22222,
          corporationId: 98000001,
        },
      })
    })

    it('switches to existing owner', () => {
      const { switchOwner } = useAuthStore.getState()
      switchOwner('character-22222')

      expect(useAuthStore.getState().activeOwnerId).toBe('character-22222')
    })

    it('does nothing for non-existent owner', () => {
      const { switchOwner } = useAuthStore.getState()
      switchOwner('character-99999')

      expect(useAuthStore.getState().activeOwnerId).toBe('character-11111')
    })
  })

  describe('updateOwnerTokens', () => {
    beforeEach(() => {
      const { addOwner } = useAuthStore.getState()
      addOwner({
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        expiresAt: 1000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })
    })

    it('updates tokens for existing owner', () => {
      const { updateOwnerTokens } = useAuthStore.getState()
      updateOwnerTokens('character-12345', {
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresAt: 9999,
      })

      const owner = useAuthStore.getState().owners['character-12345']
      expect(owner?.accessToken).toBe('new-token')
      expect(owner?.refreshToken).toBe('new-refresh')
      expect(owner?.expiresAt).toBe(9999)
    })

    it('does nothing for non-existent owner', () => {
      const stateBefore = useAuthStore.getState()
      const { updateOwnerTokens } = stateBefore
      updateOwnerTokens('character-99999', {
        accessToken: 'new',
        refreshToken: 'new',
        expiresAt: 9999,
      })

      expect(useAuthStore.getState().owners).toEqual(stateBefore.owners)
    })
  })

  describe('clearAuth', () => {
    it('clears all auth state', () => {
      const { addOwner, clearAuth } = useAuthStore.getState()
      addOwner({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      clearAuth()

      const state = useAuthStore.getState()
      expect(state.owners).toEqual({})
      expect(state.activeOwnerId).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('getActiveOwner', () => {
    it('returns null when no active owner', () => {
      expect(useAuthStore.getState().getActiveOwner()).toBeNull()
    })

    it('returns active owner', () => {
      const { addOwner } = useAuthStore.getState()
      addOwner({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      const owner = useAuthStore.getState().getActiveOwner()
      expect(owner?.name).toBe('Test')
    })
  })

  describe('getOwner', () => {
    it('returns null for unknown owner', () => {
      expect(useAuthStore.getState().getOwner('character-99999')).toBeNull()
    })

    it('returns owner by key', () => {
      const { addOwner } = useAuthStore.getState()
      addOwner({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 12345,
          type: 'character',
          name: 'Test',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      const owner = useAuthStore.getState().getOwner('character-12345')
      expect(owner?.name).toBe('Test')
    })
  })

  describe('getOwnerByCharacterId', () => {
    it('returns null for unknown character', () => {
      expect(useAuthStore.getState().getOwnerByCharacterId(99999)).toBeNull()
    })

    it('finds owner by character ID', () => {
      const { addOwner } = useAuthStore.getState()
      addOwner({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 98000001,
          type: 'corporation',
          name: 'Test Corp',
          characterId: 12345,
          corporationId: 98000001,
        },
      })

      const owner = useAuthStore.getState().getOwnerByCharacterId(12345)
      expect(owner?.name).toBe('Test Corp')
    })
  })

  describe('getAllOwners', () => {
    it('returns empty array when no owners', () => {
      expect(useAuthStore.getState().getAllOwners()).toEqual([])
    })

    it('returns all owners', () => {
      const { addOwner } = useAuthStore.getState()
      addOwner({
        accessToken: 'token1',
        refreshToken: 'refresh1',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 11111,
          type: 'character',
          name: 'Char',
          characterId: 11111,
          corporationId: 98000001,
        },
      })
      addOwner({
        accessToken: 'token2',
        refreshToken: 'refresh2',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 98000001,
          type: 'corporation',
          name: 'Corp',
          characterId: 11111,
          corporationId: 98000001,
        },
      })

      const owners = useAuthStore.getState().getAllOwners()
      expect(owners).toHaveLength(2)
    })
  })

  describe('getCharacterOwners / getCorporationOwners', () => {
    beforeEach(() => {
      const { addOwner } = useAuthStore.getState()
      addOwner({
        accessToken: 'token1',
        refreshToken: 'refresh1',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 11111,
          type: 'character',
          name: 'Char',
          characterId: 11111,
          corporationId: 98000001,
        },
      })
      addOwner({
        accessToken: 'token2',
        refreshToken: 'refresh2',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 98000001,
          type: 'corporation',
          name: 'Corp',
          characterId: 11111,
          corporationId: 98000001,
        },
      })
    })

    it('getCharacterOwners returns only characters', () => {
      const chars = useAuthStore.getState().getCharacterOwners()
      expect(chars).toHaveLength(1)
      expect(chars[0]?.type).toBe('character')
    })

    it('getCorporationOwners returns only corporations', () => {
      const corps = useAuthStore.getState().getCorporationOwners()
      expect(corps).toHaveLength(1)
      expect(corps[0]?.type).toBe('corporation')
    })
  })

  describe('isOwnerTokenExpired', () => {
    it('returns true for unknown owner', () => {
      expect(useAuthStore.getState().isOwnerTokenExpired('character-99999')).toBe(true)
    })

    it('returns true for null expiresAt', () => {
      useAuthStore.setState({
        owners: {
          'character-12345': {
            id: 12345,
            type: 'character',
            name: 'Test',
            characterId: 12345,
            corporationId: 98000001,
            accessToken: 'token',
            refreshToken: 'refresh',
            expiresAt: null,
          },
        },
        activeOwnerId: 'character-12345',
        isAuthenticated: true,
      })

      expect(useAuthStore.getState().isOwnerTokenExpired('character-12345')).toBe(true)
    })

    it('returns true for expired token', () => {
      useAuthStore.setState({
        owners: {
          'character-12345': {
            id: 12345,
            type: 'character',
            name: 'Test',
            characterId: 12345,
            corporationId: 98000001,
            accessToken: 'token',
            refreshToken: 'refresh',
            expiresAt: Date.now() - 1000,
          },
        },
        activeOwnerId: 'character-12345',
        isAuthenticated: true,
      })

      expect(useAuthStore.getState().isOwnerTokenExpired('character-12345')).toBe(true)
    })

    it('returns false for valid token', () => {
      useAuthStore.setState({
        owners: {
          'character-12345': {
            id: 12345,
            type: 'character',
            name: 'Test',
            characterId: 12345,
            corporationId: 98000001,
            accessToken: 'token',
            refreshToken: 'refresh',
            expiresAt: Date.now() + 300000,
          },
        },
        activeOwnerId: 'character-12345',
        isAuthenticated: true,
      })

      expect(useAuthStore.getState().isOwnerTokenExpired('character-12345')).toBe(false)
    })
  })

  describe('legacy API', () => {
    it('addCharacter works', () => {
      const { addCharacter } = useAuthStore.getState()
      addCharacter({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        character: { id: 12345, name: 'Test', corporationId: 98000001 },
      })

      expect(useAuthStore.getState().owners['character-12345']).toBeDefined()
    })

    it('removeCharacter works', () => {
      const { addCharacter, removeCharacter } = useAuthStore.getState()
      addCharacter({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        character: { id: 12345, name: 'Test', corporationId: 98000001 },
      })

      removeCharacter(12345)
      expect(useAuthStore.getState().owners['character-12345']).toBeUndefined()
    })

    it('getCharacter works', () => {
      const { addCharacter, getCharacter } = useAuthStore.getState()
      addCharacter({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600000,
        character: { id: 12345, name: 'Test', corporationId: 98000001 },
      })

      expect(getCharacter(12345)?.name).toBe('Test')
    })

    it('getAllCharacters works', () => {
      const { addCharacter, addOwner, getAllCharacters } = useAuthStore.getState()
      addCharacter({
        accessToken: 'token1',
        refreshToken: 'refresh1',
        expiresAt: Date.now() + 3600000,
        character: { id: 11111, name: 'Char', corporationId: 98000001 },
      })
      addOwner({
        accessToken: 'token2',
        refreshToken: 'refresh2',
        expiresAt: Date.now() + 3600000,
        owner: {
          id: 98000001,
          type: 'corporation',
          name: 'Corp',
          characterId: 11111,
          corporationId: 98000001,
        },
      })

      const chars = getAllCharacters()
      expect(chars).toHaveLength(1)
      expect(chars[0]?.type).toBe('character')
    })

    it('isTokenExpired works', () => {
      const { addCharacter, isTokenExpired } = useAuthStore.getState()
      addCharacter({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 300000,
        character: { id: 12345, name: 'Test', corporationId: 98000001 },
      })

      expect(isTokenExpired(12345)).toBe(false)
      expect(isTokenExpired(99999)).toBe(true)
    })

    it('updateCharacterTokens works', () => {
      const { addCharacter, updateCharacterTokens } = useAuthStore.getState()
      addCharacter({
        accessToken: 'old',
        refreshToken: 'old',
        expiresAt: 1000,
        character: { id: 12345, name: 'Test', corporationId: 98000001 },
      })

      updateCharacterTokens(12345, {
        accessToken: 'new',
        refreshToken: 'new',
        expiresAt: 9999,
      })

      const owner = useAuthStore.getState().owners['character-12345']
      expect(owner?.accessToken).toBe('new')
    })
  })
})
