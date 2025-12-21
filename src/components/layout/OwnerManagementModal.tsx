import { useMemo, Fragment, useReducer } from 'react'
import { useAuthStore, type Owner, ownerKey } from '@/store/auth-store'
import { ownerModalReducer, initialOwnerModalState } from './owner-modal-state'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { useStoreRegistry } from '@/store/store-registry'
import { esi } from '@/api/esi'
import { getCharacterRoles } from '@/api/endpoints/corporation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, User, Search } from 'lucide-react'
import { OwnerRow } from './OwnerRow'

interface OwnerManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

async function fetchCorpName(corpId: number): Promise<string> {
  try {
    const data = await esi.fetch<{ name: string }>(`/corporations/${corpId}/`, {
      requiresAuth: false,
    })
    return data.name
  } catch {
    return `Corporation ${corpId}`
  }
}

export function OwnerManagementModal({
  open,
  onOpenChange,
}: OwnerManagementModalProps) {
  const [state, dispatch] = useReducer(
    ownerModalReducer,
    initialOwnerModalState
  )
  const {
    authFlow,
    isUpdatingData,
    searchQuery,
    error,
    ownerToRemove,
    showLogoutAllConfirm,
    refreshingRolesOwner,
  } = state

  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])
  const selectedOwnerIds = useAuthStore((state) => state.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const currentlyRefreshing = useExpiryCacheStore((s) => s.currentlyRefreshing)
  const isBusy = isUpdatingData || !!currentlyRefreshing

  const characterOwners = useMemo(
    () => owners.filter((o) => o.type === 'character'),
    [owners]
  )
  const corpOwners = useMemo(
    () => owners.filter((o) => o.type === 'corporation'),
    [owners]
  )

  const corpsByCharacterId = useMemo(() => {
    const map = new Map<number, Owner[]>()
    for (const corp of corpOwners) {
      const existing = map.get(corp.characterId) ?? []
      existing.push(corp)
      map.set(corp.characterId, existing)
    }
    return map
  }, [corpOwners])

  const filteredCharacters = useMemo(() => {
    if (!searchQuery) return characterOwners
    const query = searchQuery.toLowerCase()
    return characterOwners.filter((char) => {
      if (char.name.toLowerCase().includes(query)) return true
      const corps = corpsByCharacterId.get(char.id) ?? []
      return corps.some((c) => c.name.toLowerCase().includes(query))
    })
  }, [characterOwners, searchQuery, corpsByCharacterId])

  const getFilteredCorpsForCharacter = (characterId: number): Owner[] => {
    const corps = corpsByCharacterId.get(characterId) ?? []
    if (!searchQuery) return corps
    const query = searchQuery.toLowerCase()
    return corps.filter((c) => c.name.toLowerCase().includes(query))
  }

  const handleAddCharacter = async () => {
    if (!window.electronAPI) return

    dispatch({ type: 'START_AUTH', flow: 'character' })
    try {
      const result = await window.electronAPI.startAuth(false)
      if (
        result.success &&
        result.accessToken &&
        result.refreshToken &&
        result.characterId &&
        result.characterName &&
        result.corporationId
      ) {
        const newOwner = {
          id: result.characterId,
          type: 'character' as const,
          name: result.characterName,
          characterId: result.characterId,
          corporationId: result.corporationId,
        }
        useAuthStore.getState().addOwner({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
          scopes: result.scopes,
          corporationRoles: result.corporationRoles,
          owner: newOwner,
        })
        dispatch({ type: 'END_AUTH' })
        useExpiryCacheStore
          .getState()
          .queueAllEndpointsForOwner(ownerKey(newOwner.type, newOwner.id))
      } else if (result.error && result.error !== 'Authentication cancelled') {
        dispatch({ type: 'SET_ERROR', error: result.error })
      }
    } finally {
      dispatch({ type: 'END_AUTH' })
    }
  }

  const handleAddCorporation = async (forCharacter?: Owner) => {
    if (!window.electronAPI) return

    dispatch({ type: 'START_AUTH', flow: 'corporation' })
    try {
      const result = await window.electronAPI.startAuth(true)
      if (
        result.success &&
        result.accessToken &&
        result.refreshToken &&
        result.characterId &&
        result.characterName &&
        result.corporationId
      ) {
        if (forCharacter && result.characterId !== forCharacter.characterId) {
          dispatch({
            type: 'SET_ERROR',
            error: `Please authenticate with ${forCharacter.name} to add their corporation.`,
          })
          return
        }

        const store = useAuthStore.getState()

        const charKey = ownerKey('character', result.characterId)
        if (!store.getOwner(charKey)) {
          store.addOwner({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt ?? Date.now() + 1200000,
            scopes: result.scopes,
            corporationRoles: result.corporationRoles,
            owner: {
              id: result.characterId,
              type: 'character',
              name: result.characterName,
              characterId: result.characterId,
              corporationId: result.corporationId,
            },
          })
        } else {
          store.updateOwnerTokens(charKey, {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt ?? Date.now() + 1200000,
            scopes: result.scopes,
          })
          if (result.corporationRoles) {
            store.updateOwnerRoles(charKey, result.corporationRoles)
          }
        }

        const corpName = await fetchCorpName(result.corporationId)
        const newCorpOwner = {
          id: result.corporationId,
          type: 'corporation' as const,
          name: corpName,
          characterId: result.characterId,
          corporationId: result.corporationId,
        }
        store.addOwner({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
          scopes: result.scopes,
          corporationRoles: result.corporationRoles,
          owner: newCorpOwner,
        })
        dispatch({ type: 'END_AUTH' })
        useExpiryCacheStore
          .getState()
          .queueAllEndpointsForOwner(
            ownerKey(newCorpOwner.type, newCorpOwner.id)
          )
      } else if (result.error && result.error !== 'Authentication cancelled') {
        dispatch({ type: 'SET_ERROR', error: result.error })
      }
    } finally {
      dispatch({ type: 'END_AUTH' })
    }
  }

  const handleCancelAuth = () => {
    window.electronAPI?.cancelAuth()
  }

  const handleRemoveOwnerClick = (owner: Owner, e: React.MouseEvent) => {
    e.stopPropagation()
    dispatch({ type: 'CONFIRM_REMOVE', owner })
  }

  const handleRemoveOwnerConfirm = async () => {
    if (!ownerToRemove) return
    const owner = ownerToRemove
    dispatch({ type: 'CANCEL_REMOVE' })
    dispatch({ type: 'SET_UPDATING', value: true })
    try {
      const ownersToRemove: Owner[] = [owner]
      if (owner.type === 'character') {
        const linkedCorps = corpsByCharacterId.get(owner.id) ?? []
        ownersToRemove.push(...linkedCorps)
      }

      for (const o of ownersToRemove) {
        const key = ownerKey(o.type, o.id)
        if (window.electronAPI && o.type === 'character') {
          await window.electronAPI.logout(o.id)
        }
        await useStoreRegistry.getState().removeForOwnerAll(o.type, o.id)
        useExpiryCacheStore.getState().clearForOwner(key)
        useAuthStore.getState().removeOwner(key)
      }
    } finally {
      dispatch({ type: 'SET_UPDATING', value: false })
    }
  }

  const handleToggleOwner = (owner: Owner) => {
    useAuthStore.getState().toggleOwnerSelection(ownerKey(owner.type, owner.id))
  }

  const handleSelectAll = () => {
    useAuthStore.getState().selectAllOwners()
  }

  const handleDeselectAll = () => {
    useAuthStore.getState().deselectAllOwners()
  }

  const handleReauth = async (owner: Owner, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.electronAPI) return

    const hadCorporationScopes = owner.scopes?.some((s) =>
      s.includes('corporation')
    )
    const needsCorporationScopes =
      owner.type === 'corporation' || hadCorporationScopes
    dispatch({
      type: 'START_AUTH',
      flow: needsCorporationScopes ? 'corporation' : 'character',
    })

    try {
      const result = await window.electronAPI.startAuth(needsCorporationScopes)
      if (
        result.success &&
        result.accessToken &&
        result.refreshToken &&
        result.characterId
      ) {
        if (result.characterId !== owner.characterId) {
          dispatch({
            type: 'SET_ERROR',
            error: `Wrong character authenticated. Expected ${owner.name}, got a different character. Please try again.`,
          })
          return
        }
        const key = ownerKey(owner.type, owner.id)
        useAuthStore.getState().updateOwnerTokens(key, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
          scopes: result.scopes,
        })
      } else if (result.error && result.error !== 'Authentication cancelled') {
        dispatch({ type: 'SET_ERROR', error: result.error })
      }
    } finally {
      dispatch({ type: 'END_AUTH' })
    }
  }

  const handleLogoutAllClick = () => {
    dispatch({ type: 'SHOW_LOGOUT_ALL' })
  }

  const handleLogoutAllConfirm = async () => {
    dispatch({ type: 'HIDE_LOGOUT_ALL' })
    dispatch({ type: 'SET_UPDATING', value: true })
    try {
      if (window.electronAPI) {
        for (const owner of characterOwners) {
          await window.electronAPI.logout(owner.id)
        }
      }
      useAuthStore.getState().clearAuth()
      await useStoreRegistry.getState().clearAll()
      await useExpiryCacheStore.getState().clear()
      onOpenChange(false)
    } finally {
      dispatch({ type: 'SET_UPDATING', value: false })
    }
  }

  const handleRefreshRoles = async (owner: Owner) => {
    const key = ownerKey(owner.type, owner.id)
    dispatch({ type: 'SET_REFRESHING_ROLES', ownerKey: key })
    try {
      const roles = await getCharacterRoles(owner.characterId)
      useAuthStore.getState().updateOwnerRoles(key, roles)
    } catch {
      dispatch({
        type: 'SET_ERROR',
        error: 'Failed to refresh corporation roles',
      })
    } finally {
      dispatch({ type: 'SET_REFRESHING_ROLES', ownerKey: null })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Accounts</DialogTitle>
          <DialogDescription>
            Add or remove characters and corporations to track their assets.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-semantic-danger/50 bg-semantic-danger/10 px-3 py-2 text-sm text-semantic-danger">
            {error}
          </div>
        )}

        {owners.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) =>
                dispatch({ type: 'SET_SEARCH', query: e.target.value })
              }
              className="w-full rounded-md border border-border bg-surface-secondary py-2 pl-10 pr-4 text-sm text-content placeholder:text-content-muted focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent"
            />
          </div>
        )}

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-4 pr-4">
            {owners.length > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  disabled={isBusy}
                  className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-tertiary disabled:opacity-50"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAll}
                  disabled={isBusy}
                  className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-tertiary disabled:opacity-50"
                >
                  Deselect All
                </button>
              </div>
            )}

            {/* Characters & Corporations Section */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-content-secondary">
                <User className="h-3 w-3" />
                Accounts ({filteredCharacters.length})
              </div>
              {filteredCharacters.length === 0 ? (
                <p className="py-4 text-center text-sm text-content-muted">
                  No characters added yet
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredCharacters.map((character) => {
                    const charKey = ownerKey(character.type, character.id)
                    const hasDirector =
                      character.corporationRoles?.roles?.includes('Director') ??
                      false
                    const characterCorps = getFilteredCorpsForCharacter(
                      character.id
                    )
                    const hasCorp = characterCorps.length > 0

                    return (
                      <Fragment key={charKey}>
                        <OwnerRow
                          owner={character}
                          isSelected={selectedSet.has(charKey)}
                          disabled={isBusy}
                          isRefreshingRoles={refreshingRolesOwner === charKey}
                          hasDirectorRole={hasDirector}
                          hasCorporation={hasCorp}
                          onToggle={() => handleToggleOwner(character)}
                          onRemove={(e) => handleRemoveOwnerClick(character, e)}
                          onReauth={(e) => handleReauth(character, e)}
                          onRefreshRoles={() => handleRefreshRoles(character)}
                          onAddCorporation={() =>
                            handleAddCorporation(character)
                          }
                        />
                        {characterCorps.map((corp) => (
                          <OwnerRow
                            key={ownerKey(corp.type, corp.id)}
                            owner={corp}
                            isSelected={selectedSet.has(
                              ownerKey(corp.type, corp.id)
                            )}
                            disabled={isBusy}
                            indented
                            onToggle={() => handleToggleOwner(corp)}
                            onRemove={(e) => handleRemoveOwnerClick(corp, e)}
                            onReauth={(e) => handleReauth(corp, e)}
                          />
                        ))}
                      </Fragment>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {authFlow !== 'idle' ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="flex items-center gap-2 text-content-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Waiting for EVE login...</span>
              </div>
              <button
                onClick={handleCancelAuth}
                className="text-sm text-content-muted hover:text-content-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : isBusy ? (
            <div className="flex items-center justify-center gap-2 py-2 text-content-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating data...</span>
            </div>
          ) : (
            <button
              onClick={handleAddCharacter}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-hover"
            >
              <User className="h-4 w-4" />
              Add Character
            </button>
          )}
          {owners.length > 0 && !isBusy && authFlow === 'idle' && (
            <button
              onClick={handleLogoutAllClick}
              className="w-full rounded-md border border-semantic-danger/50 px-4 py-2 text-sm font-medium text-semantic-danger hover:bg-semantic-danger/10"
            >
              Logout All
            </button>
          )}
        </div>

        <ConfirmDialog
          open={ownerToRemove !== null}
          onOpenChange={(open) => !open && dispatch({ type: 'CANCEL_REMOVE' })}
          title={`Remove ${ownerToRemove?.type === 'corporation' ? 'Corporation' : 'Character'}?`}
          description={`Are you sure you want to remove ${ownerToRemove?.name}? All cached data for this account will be deleted.`}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={handleRemoveOwnerConfirm}
        />

        <ConfirmDialog
          open={showLogoutAllConfirm}
          onOpenChange={(open) =>
            dispatch({ type: open ? 'SHOW_LOGOUT_ALL' : 'HIDE_LOGOUT_ALL' })
          }
          title="Logout All Accounts?"
          description="Are you sure you want to logout all accounts? All cached data will be deleted and you will need to re-authenticate each account."
          confirmLabel="Logout All"
          variant="danger"
          onConfirm={handleLogoutAllConfirm}
        />
      </DialogContent>
    </Dialog>
  )
}
