import { useState, useMemo } from 'react'
import { useAuthStore, type Owner, ownerKey } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
import { useBlueprintsStore } from '@/store/blueprints-store'
import { useClonesStore } from '@/store/clones-store'
import { useContractsStore } from '@/store/contracts-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useWalletStore } from '@/store/wallet-store'
import { useStructuresStore } from '@/store/structures-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
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
  AlertCircle,
  RefreshCw,
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
  const [isUpdatingData, setIsUpdatingData] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

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
        setIsAddingCharacter(false)
        setIsUpdatingData(true)
        await useAssetStore.getState().updateForOwner({
          ...newOwner,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
        })
        setIsUpdatingData(false)
      } else if (result.error && result.error !== 'Authentication cancelled') {
        setError(result.error)
      }
    } finally {
      setIsAddingCharacter(false)
      setIsUpdatingData(false)
    }
  }

  const handleAddCorporation = async () => {
    if (!window.electronAPI) return

    setIsAddingCorporation(true)
    setError(null)
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
        const store = useAuthStore.getState()

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
          store.updateOwnerTokens(charKey, {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt ?? Date.now() + 1200000,
          })
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
          owner: newCorpOwner,
        })
        setIsAddingCorporation(false)
        setIsUpdatingData(true)
        await useAssetStore.getState().updateForOwner({
          ...newCorpOwner,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
        })
        setIsUpdatingData(false)
      } else if (result.error && result.error !== 'Authentication cancelled') {
        setError(result.error)
      }
    } finally {
      setIsAddingCorporation(false)
      setIsUpdatingData(false)
    }
  }

  const handleCancelAuth = () => {
    window.electronAPI?.cancelAuth()
  }

  const handleRemoveOwner = async (owner: Owner, e: React.MouseEvent) => {
    e.stopPropagation()
    setIsUpdatingData(true)
    try {
      const key = ownerKey(owner.type, owner.id)
      if (window.electronAPI && owner.type === 'character') {
        await window.electronAPI.logout(owner.id)
      }
      useAuthStore.getState().removeOwner(key)
      await Promise.all([
        useAssetStore.getState().removeForOwner(owner.type, owner.id),
        useBlueprintsStore.getState().removeForOwner(owner.type, owner.id),
        useClonesStore.getState().removeForOwner(owner.type, owner.id),
        useContractsStore.getState().removeForOwner(owner.type, owner.id),
        useIndustryJobsStore.getState().removeForOwner(owner.type, owner.id),
        useMarketOrdersStore.getState().removeForOwner(owner.type, owner.id),
        useWalletStore.getState().removeForOwner(owner.type, owner.id),
        useStructuresStore.getState().removeForOwner(owner.type, owner.id),
      ])
    } finally {
      setIsUpdatingData(false)
    }
  }

  const handleSwitchOwner = (owner: Owner | null) => {
    if (owner === null) {
      useAuthStore.getState().switchOwner(null)
    } else {
      useAuthStore.getState().switchOwner(ownerKey(owner.type, owner.id))
    }
  }

  const handleReauth = async (owner: Owner, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.electronAPI) return

    const isCorp = owner.type === 'corporation'
    if (isCorp) {
      setIsAddingCorporation(true)
    } else {
      setIsAddingCharacter(true)
    }
    setError(null)

    try {
      const result = await window.electronAPI.startAuth(isCorp)
      if (
        result.success &&
        result.accessToken &&
        result.refreshToken &&
        result.characterId
      ) {
        const key = ownerKey(owner.type, owner.id)
        useAuthStore.getState().updateOwnerTokens(key, {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
        })
      } else if (result.error && result.error !== 'Authentication cancelled') {
        setError(result.error)
      }
    } finally {
      setIsAddingCharacter(false)
      setIsAddingCorporation(false)
    }
  }

  const handleLogoutAll = async () => {
    setIsUpdatingData(true)
    try {
      if (window.electronAPI) {
        for (const owner of characterOwners) {
          await window.electronAPI.logout(owner.id)
        }
      }
      useAuthStore.getState().clearAuth()
      await Promise.all([
        useAssetStore.getState().clear(),
        useBlueprintsStore.getState().clear(),
        useClonesStore.getState().clear(),
        useContractsStore.getState().clear(),
        useIndustryJobsStore.getState().clear(),
        useMarketOrdersStore.getState().clear(),
        useWalletStore.getState().clear(),
        useStructuresStore.getState().clear(),
        useExpiryCacheStore.getState().clear(),
      ])
      onOpenChange(false)
    } finally {
      setIsUpdatingData(false)
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
              className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-50 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-4 pr-4">
            {/* All Characters Option */}
            {owners.length > 1 && (
              <div
                onClick={() => handleSwitchOwner(null)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-slate-700 ${
                  activeOwnerId === null ? 'bg-slate-700/50 ring-1 ring-blue-500/50' : ''
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600">
                  <User className="h-4 w-4 text-slate-300" />
                </div>
                <span className="text-sm font-medium">All Characters</span>
                {activeOwnerId === null && <CheckCircle2 className="h-4 w-4 text-blue-400" />}
              </div>
            )}

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
                      disabled={isUpdatingData}
                      onSelect={() => handleSwitchOwner(owner)}
                      onRemove={(e) => handleRemoveOwner(owner, e)}
                      onReauth={(e) => handleReauth(owner, e)}
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
                      disabled={isUpdatingData}
                      onSelect={() => handleSwitchOwner(owner)}
                      onRemove={(e) => handleRemoveOwner(owner, e)}
                      onReauth={(e) => handleReauth(owner, e)}
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
          ) : isUpdatingData ? (
            <div className="flex items-center justify-center gap-2 py-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Updating data...</span>
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
          {owners.length > 0 && !isUpdatingData && (
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
  disabled?: boolean
  onSelect: () => void
  onRemove: (e: React.MouseEvent) => void
  onReauth: (e: React.MouseEvent) => void
}

function OwnerRow({ owner, isActive, disabled, onSelect, onRemove, onReauth }: OwnerRowProps) {
  const isCorp = owner.type === 'corporation'

  return (
    <div
      onClick={disabled ? undefined : onSelect}
      className={`flex items-center justify-between rounded-md px-3 py-2 transition-colors ${
        disabled ? 'opacity-50' : 'hover:bg-slate-700'
      } ${isActive ? 'bg-slate-700/50 ring-1 ring-blue-500/50' : ''} ${owner.authFailed ? 'ring-1 ring-red-500/50' : ''}`}
    >
      <div className="flex items-center gap-2">
        <OwnerIcon ownerId={owner.id} ownerType={owner.type} size="lg" />
        <span className={`text-sm ${isCorp ? 'text-yellow-400' : ''}`}>
          {owner.name}
        </span>
        {owner.authFailed && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-3 w-3" />
            Re-auth needed
          </span>
        )}
        {isActive && !owner.authFailed && <CheckCircle2 className="h-4 w-4 text-blue-400" />}
      </div>
      <div className="flex items-center gap-1">
        {owner.authFailed && !disabled && (
          <button
            onClick={onReauth}
            className="rounded p-1 text-amber-400 hover:bg-slate-600 hover:text-amber-300"
            title="Re-authenticate"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        {!disabled && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-slate-400 hover:bg-slate-600 hover:text-red-400"
            title={`Remove ${owner.type}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
