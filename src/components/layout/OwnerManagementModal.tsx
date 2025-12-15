import { useState, useMemo } from 'react'
import { useAuthStore, type Owner, ownerKey } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
import { useBlueprintsStore } from '@/store/blueprints-store'
import { useClonesStore } from '@/store/clones-store'
import { useContractsStore } from '@/store/contracts-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useWalletStore } from '@/store/wallet-store'
import { useWalletJournalStore } from '@/store/wallet-journal-store'
import { useStructuresStore } from '@/store/structures-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { esi } from '@/api/esi'
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
  Square,
  CheckSquare,
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
    const data = await esi.fetch<{ name: string }>(
      `/corporations/${corpId}/`,
      { requiresAuth: false }
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
  const selectedOwnerIds = useAuthStore((state) => state.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const assetsUpdating = useAssetStore((s) => s.isUpdating)
  const blueprintsUpdating = useBlueprintsStore((s) => s.isUpdating)
  const clonesUpdating = useClonesStore((s) => s.isUpdating)
  const contractsUpdating = useContractsStore((s) => s.isUpdating)
  const industryUpdating = useIndustryJobsStore((s) => s.isUpdating)
  const ordersUpdating = useMarketOrdersStore((s) => s.isUpdating)
  const walletUpdating = useWalletStore((s) => s.isUpdating)
  const journalUpdating = useWalletJournalStore((s) => s.isUpdating)
  const structuresUpdating = useStructuresStore((s) => s.isUpdating)

  const isBusy =
    isUpdatingData ||
    assetsUpdating ||
    blueprintsUpdating ||
    clonesUpdating ||
    contractsUpdating ||
    industryUpdating ||
    ordersUpdating ||
    walletUpdating ||
    journalUpdating ||
    structuresUpdating

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
          scopes: result.scopes,
          owner: newOwner,
        })
        setIsAddingCharacter(false)
        useExpiryCacheStore.getState().queueAllEndpointsForOwner(ownerKey(newOwner.type, newOwner.id))
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
            scopes: result.scopes,
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
          owner: newCorpOwner,
        })
        setIsAddingCorporation(false)
        useExpiryCacheStore.getState().queueAllEndpointsForOwner(ownerKey(newCorpOwner.type, newCorpOwner.id))
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
    setIsUpdatingData(true)
    try {
      const key = ownerKey(owner.type, owner.id)
      if (window.electronAPI && owner.type === 'character') {
        await window.electronAPI.logout(owner.id)
      }
      useAuthStore.getState().removeOwner(key)
      useExpiryCacheStore.getState().clearForOwner(key)
      await Promise.all([
        useAssetStore.getState().removeForOwner(owner.type, owner.id),
        useBlueprintsStore.getState().removeForOwner(owner.type, owner.id),
        useClonesStore.getState().removeForOwner(owner.type, owner.id),
        useContractsStore.getState().removeForOwner(owner.type, owner.id),
        useIndustryJobsStore.getState().removeForOwner(owner.type, owner.id),
        useMarketOrdersStore.getState().removeForOwner(owner.type, owner.id),
        useWalletStore.getState().removeForOwner(owner.type, owner.id),
        useWalletJournalStore.getState().removeForOwner(owner.type, owner.id),
        useStructuresStore.getState().removeForOwner(owner.type, owner.id),
      ])
    } finally {
      setIsUpdatingData(false)
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

    const hadCorporationScopes = owner.scopes?.some((s) => s.includes('corporation'))
    const needsCorporationScopes = owner.type === 'corporation' || hadCorporationScopes
    if (needsCorporationScopes) {
      setIsAddingCorporation(true)
    } else {
      setIsAddingCharacter(true)
    }
    setError(null)

    try {
      const result = await window.electronAPI.startAuth(needsCorporationScopes)
      if (
        result.success &&
        result.accessToken &&
        result.refreshToken &&
        result.characterId
      ) {
        if (result.characterId !== owner.characterId) {
          setError(
            `Wrong character authenticated. Expected ${owner.name}, got a different character. Please try again.`
          )
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
        useWalletJournalStore.getState().clear(),
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
              onChange={(e) => setSearchQuery(e.target.value)}
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

            {/* Characters Section */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-content-secondary">
                <User className="h-3 w-3" />
                Characters ({filteredCharacters.length})
              </div>
              {filteredCharacters.length === 0 ? (
                <p className="py-4 text-center text-sm text-content-muted">
                  No characters added yet
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredCharacters.map((owner) => (
                    <OwnerRow
                      key={ownerKey(owner.type, owner.id)}
                      owner={owner}
                      isSelected={selectedSet.has(ownerKey(owner.type, owner.id))}
                      disabled={isBusy}
                      onToggle={() => handleToggleOwner(owner)}
                      onRemove={(e) => handleRemoveOwner(owner, e)}
                      onReauth={(e) => handleReauth(owner, e)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Corporations Section */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-status-corp/70">
                <Building2 className="h-3 w-3" />
                Corporations ({filteredCorps.length})
              </div>
              {filteredCorps.length === 0 ? (
                <p className="py-4 text-center text-sm text-content-muted">
                  No corporations added
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredCorps.map((owner) => (
                    <OwnerRow
                      key={ownerKey(owner.type, owner.id)}
                      owner={owner}
                      isSelected={selectedSet.has(ownerKey(owner.type, owner.id))}
                      disabled={isBusy}
                      onToggle={() => handleToggleOwner(owner)}
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
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {isAddingCharacter || isAddingCorporation ? (
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
            <div className="flex gap-2">
              <button
                onClick={handleAddCharacter}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium hover:bg-accent-hover"
              >
                <User className="h-4 w-4" />
                Add Character
              </button>
              <button
                onClick={handleAddCorporation}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-semantic-warning px-4 py-2 text-sm font-medium text-content hover:opacity-90"
              >
                <Building2 className="h-4 w-4" />
                Add Corporation
              </button>
            </div>
          )}
          {owners.length > 0 && !isBusy && (
            <button
              onClick={handleLogoutAll}
              className="w-full rounded-md border border-semantic-danger/50 px-4 py-2 text-sm font-medium text-semantic-danger hover:bg-semantic-danger/10"
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
  isSelected: boolean
  disabled?: boolean
  onToggle: () => void
  onRemove: (e: React.MouseEvent) => void
  onReauth: (e: React.MouseEvent) => void
}

function OwnerRow({ owner, isSelected, disabled, onToggle, onRemove, onReauth }: OwnerRowProps) {
  const isCorp = owner.type === 'corporation'
  const needsAttention = owner.authFailed || owner.scopesOutdated
  const CheckIcon = isSelected ? CheckSquare : Square

  return (
    <div
      onClick={disabled ? undefined : onToggle}
      className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 transition-colors ${
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-surface-tertiary'
      } ${owner.authFailed ? 'ring-1 ring-semantic-danger/50' : ''} ${owner.scopesOutdated && !owner.authFailed ? 'ring-1 ring-semantic-warning/50' : ''}`}
    >
      <div className="flex items-center gap-2">
        <CheckIcon className={`h-4 w-4 ${isSelected ? 'text-accent' : 'text-content-muted'}`} />
        <OwnerIcon ownerId={owner.id} ownerType={owner.type} size="lg" />
        <span className={`text-sm ${isCorp ? 'text-status-corp' : ''}`}>
          {owner.name}
        </span>
        {owner.authFailed && (
          <span className="flex items-center gap-1 text-xs text-semantic-danger">
            <AlertCircle className="h-3 w-3" />
            Re-auth needed
          </span>
        )}
        {owner.scopesOutdated && !owner.authFailed && (
          <span className="flex items-center gap-1 text-xs text-semantic-warning">
            <AlertCircle className="h-3 w-3" />
            Upgrade scopes
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {needsAttention && !disabled && (
          <button
            onClick={onReauth}
            className="rounded p-1 text-semantic-warning hover:bg-surface-tertiary"
            title={owner.authFailed ? 'Re-authenticate' : 'Upgrade scopes'}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        {!disabled && (
          <button
            onClick={onRemove}
            className="rounded p-1 text-content-secondary hover:bg-surface-tertiary hover:text-semantic-danger"
            title={`Remove ${owner.type}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
