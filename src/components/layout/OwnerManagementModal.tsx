import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuthStore, type Owner, ownerKey } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
import { esiClient } from '@/api/esi-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  X,
  Loader2,
  Building2,
  User,
  Search,
  CheckCircle2,
} from 'lucide-react'
import { OwnerIcon } from '@/components/ui/type-icon'

interface OwnerManagementModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

async function fetchCorpName(corpId: number): Promise<string> {
  try {
    const data = await esiClient.fetchPublic<{ name: string }>(
      `/corporations/${corpId}/`
    )
    return data.name
  } catch {
    return `Corporation ${corpId}`
  }
}

export function OwnerManagementModal({
  open,
  onOpenChange,
}: OwnerManagementModalProps) {
  const [isAddingCharacter, setIsAddingCharacter] = useState(false)
  const [isAddingCorporation, setIsAddingCorporation] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const AUTH_COOLDOWN_MS = 10000

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
      }
    }
  }, [])

  const startCooldown = () => {
    setCooldownRemaining(AUTH_COOLDOWN_MS)
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current)
    }
    cooldownTimerRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1000) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current)
            cooldownTimerRef.current = null
          }
          return 0
        }
        return prev - 1000
      })
    }, 1000)
  }

  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])
  const activeOwnerId = useAuthStore((state) => state.activeOwnerId)

  const characterOwners = useMemo(
    () => owners.filter((o) => o.type === 'character'),
    [owners]
  )
  const corpOwners = useMemo(
    () => owners.filter((o) => o.type === 'corporation'),
    [owners]
  )

  const filteredCharacters = useMemo(() => {
    if (!searchQuery) return characterOwners
    const query = searchQuery.toLowerCase()
    return characterOwners.filter((o) => o.name.toLowerCase().includes(query))
  }, [characterOwners, searchQuery])

  const filteredCorps = useMemo(() => {
    if (!searchQuery) return corpOwners
    const query = searchQuery.toLowerCase()
    return corpOwners.filter((o) => o.name.toLowerCase().includes(query))
  }, [corpOwners, searchQuery])

  const handleAddCharacter = async () => {
    if (!window.electronAPI) return

    setIsAddingCharacter(true)
    setError(null)
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
          owner: newOwner,
        })
        startCooldown()
        useAssetStore.getState().updateForOwner({
          ...newOwner,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
        })
      } else if (result.error && result.error !== 'Authentication cancelled') {
        setError(result.error)
      }
    } finally {
      setIsAddingCharacter(false)
    }
  }

  const handleAddCorporation = async () => {
    if (!window.electronAPI) return

    setIsAddingCorporation(true)
    setError(null)
    try {
      // Login with corporation scopes
      const result = await window.electronAPI.startAuth(true)
      if (
        result.success &&
        result.accessToken &&
        result.refreshToken &&
        result.characterId &&
        result.characterName &&
        result.corporationId
      ) {
        const store = useAuthStore.getState()

        // Add the character if not already added
        const charKey = ownerKey('character', result.characterId)
        if (!store.getOwner(charKey)) {
          store.addOwner({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt ?? Date.now() + 1200000,
            owner: {
              id: result.characterId,
              type: 'character',
              name: result.characterName,
              characterId: result.characterId,
              corporationId: result.corporationId,
            },
          })
        } else {
          // Update existing character's tokens
          store.updateOwnerTokens(charKey, {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt ?? Date.now() + 1200000,
          })
        }

        // Add the corporation
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
          owner: newCorpOwner,
        })
        startCooldown()
        useAssetStore.getState().updateForOwner({
          ...newCorpOwner,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
        })
      } else if (result.error && result.error !== 'Authentication cancelled') {
        setError(result.error)
      }
    } finally {
      setIsAddingCorporation(false)
    }
  }

  const handleCancelAuth = () => {
    window.electronAPI?.cancelAuth()
  }

  const handleRemoveOwner = async (owner: Owner, e: React.MouseEvent) => {
    e.stopPropagation()
    const key = ownerKey(owner.type, owner.id)
    if (window.electronAPI && owner.type === 'character') {
      await window.electronAPI.logout(owner.id)
    }
    useAuthStore.getState().removeOwner(key)
    await useAssetStore.getState().removeForOwner(owner.type, owner.id)
  }

  const handleSwitchOwner = (owner: Owner) => {
    useAuthStore.getState().switchOwner(ownerKey(owner.type, owner.id))
  }

  const handleLogoutAll = async () => {
    if (window.electronAPI) {
      for (const owner of characterOwners) {
        await window.electronAPI.logout(owner.id)
      }
    }
    useAuthStore.getState().clearAuth()
    await useAssetStore.getState().clear()
    onOpenChange(false)
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
          <div className="rounded-md border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {owners.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-4 pr-4">
            {/* Characters Section */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                <User className="h-3 w-3" />
                Characters ({filteredCharacters.length})
              </div>
              {filteredCharacters.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  No characters added yet
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredCharacters.map((owner) => (
                    <OwnerRow
                      key={ownerKey(owner.type, owner.id)}
                      owner={owner}
                      isActive={
                        ownerKey(owner.type, owner.id) === activeOwnerId
                      }
                      onSelect={() => handleSwitchOwner(owner)}
                      onRemove={(e) => handleRemoveOwner(owner, e)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Corporations Section */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-yellow-400/70">
                <Building2 className="h-3 w-3" />
                Corporations ({filteredCorps.length})
              </div>
              {filteredCorps.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  No corporations added
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredCorps.map((owner) => (
                    <OwnerRow
                      key={ownerKey(owner.type, owner.id)}
                      owner={owner}
                      isActive={
                        ownerKey(owner.type, owner.id) === activeOwnerId
                      }
                      onSelect={() => handleSwitchOwner(owner)}
                      onRemove={(e) => handleRemoveOwner(owner, e)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-slate-700 pt-4">
          {isAddingCharacter || isAddingCorporation ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Waiting for EVE login...</span>
              </div>
              <button
                onClick={handleCancelAuth}
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : cooldownRemaining > 0 ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <span className="text-sm text-slate-400">
                Please wait {Math.ceil(cooldownRemaining / 1000)}s before adding another account
              </span>
              <div className="flex gap-2 w-full">
                <button
                  disabled
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600/50 px-4 py-2 text-sm font-medium cursor-not-allowed opacity-50"
                >
                  <User className="h-4 w-4" />
                  Add Character
                </button>
                <button
                  disabled
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-yellow-600/50 px-4 py-2 text-sm font-medium cursor-not-allowed opacity-50"
                >
                  <Building2 className="h-4 w-4" />
                  Add Corporation
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleAddCharacter}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
              >
                <User className="h-4 w-4" />
                Add Character
              </button>
              <button
                onClick={handleAddCorporation}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium hover:bg-yellow-500"
              >
                <Building2 className="h-4 w-4" />
                Add Corporation
              </button>
            </div>
          )}
          {owners.length > 0 && (
            <button
              onClick={handleLogoutAll}
              className="w-full rounded-md border border-red-800 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30"
            >
              Logout All
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface OwnerRowProps {
  owner: Owner
  isActive: boolean
  onSelect: () => void
  onRemove: (e: React.MouseEvent) => void
}

function OwnerRow({ owner, isActive, onSelect, onRemove }: OwnerRowProps) {
  const isCorp = owner.type === 'corporation'

  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-slate-700 ${
        isActive ? 'bg-slate-700/50 ring-1 ring-blue-500/50' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <OwnerIcon ownerId={owner.id} ownerType={owner.type} size="lg" />
        <span className={`text-sm ${isCorp ? 'text-yellow-400' : ''}`}>
          {owner.name}
        </span>
        {isActive && <CheckCircle2 className="h-4 w-4 text-blue-400" />}
      </div>
      <button
        onClick={onRemove}
        className="rounded p-1 text-slate-400 hover:bg-slate-600 hover:text-red-400"
        title={`Remove ${owner.type}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
