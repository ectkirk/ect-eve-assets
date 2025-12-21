import { useState, useMemo } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { OwnerIcon } from '@/components/ui/type-icon'
import { OwnerManagementModal } from './OwnerManagementModal'
import eveSsoLoginWhite from '/eve-sso-login-white.png'

export function OwnerButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const [isAddingOwner, setIsAddingOwner] = useState(false)
  const [isUpdatingData, setIsUpdatingData] = useState(false)

  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])
  const selectedOwnerIds = useAuthStore((state) => state.selectedOwnerIds)

  const selectedOwners = useMemo(
    () =>
      owners.filter((o) => selectedOwnerIds.includes(ownerKey(o.type, o.id))),
    [owners, selectedOwnerIds]
  )

  const hasAuthFailure = useMemo(
    () => owners.some((o) => o.authFailed),
    [owners]
  )

  const hasScopesOutdated = useMemo(
    () => owners.some((o) => o.scopesOutdated && !o.authFailed),
    [owners]
  )

  const handleAddFirstCharacter = async () => {
    if (!window.electronAPI) return

    setIsAddingOwner(true)
    try {
      const result = await window.electronAPI.startAuth()
      if (
        result.success &&
        result.accessToken &&
        result.refreshToken &&
        result.characterId &&
        result.characterName &&
        result.corporationId
      ) {
        useAuthStore.getState().addOwner({
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
        setIsAddingOwner(false)
        setIsUpdatingData(true)
        useExpiryCacheStore
          .getState()
          .queueAllEndpointsForOwner(ownerKey('character', result.characterId))
        setIsUpdatingData(false)
      }
    } finally {
      setIsAddingOwner(false)
      setIsUpdatingData(false)
    }
  }

  if (isUpdatingData) {
    return (
      <div className="flex items-center gap-2 text-sm text-content-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Updating data...
      </div>
    )
  }

  if (owners.length === 0) {
    return (
      <button
        onClick={handleAddFirstCharacter}
        disabled={isAddingOwner}
        className="transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {isAddingOwner ? (
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Logging in...
          </div>
        ) : (
          <img
            src={eveSsoLoginWhite}
            alt="Log in with EVE Online"
            className="h-8"
          />
        )}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-tertiary"
      >
        {hasAuthFailure && (
          <span title="Auth failure - click to re-authenticate">
            <AlertTriangle className="h-4 w-4 text-semantic-danger" />
          </span>
        )}
        {hasScopesOutdated && !hasAuthFailure && (
          <span title="Scopes outdated - click to upgrade">
            <AlertTriangle className="h-4 w-4 text-semantic-warning" />
          </span>
        )}
        {selectedOwners.length === 0 ? (
          <span className="text-sm text-content-muted">No Selection</span>
        ) : (
          <div className="flex items-center gap-3">
            {(() => {
              const selectedCharacters = selectedOwners
                .filter((o) => o.type === 'character')
                .slice(0, 5)
              const selectedCorps = selectedOwners
                .filter((o) => o.type === 'corporation')
                .slice(0, 5)
              const totalCharacters = owners.filter(
                (o) => o.type === 'character'
              ).length
              const totalCorps = owners.filter(
                (o) => o.type === 'corporation'
              ).length
              return (
                <>
                  {totalCharacters > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="flex items-center">
                        {selectedCharacters.map((owner, i) => (
                          <div
                            key={ownerKey(owner.type, owner.id)}
                            className="relative rounded-full ring-2 ring-surface-secondary"
                            style={{
                              marginLeft: i === 0 ? 0 : -8,
                              zIndex: 5 - i,
                            }}
                          >
                            <OwnerIcon
                              ownerId={owner.id}
                              ownerType={owner.type}
                              size="lg"
                            />
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-content-secondary">
                        (
                        {
                          selectedOwners.filter((o) => o.type === 'character')
                            .length
                        }
                        /{totalCharacters})
                      </span>
                    </div>
                  )}
                  {totalCorps > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="flex items-center">
                        {selectedCorps.map((owner, i) => (
                          <div
                            key={ownerKey(owner.type, owner.id)}
                            className="relative rounded-full ring-2 ring-surface-secondary"
                            style={{
                              marginLeft: i === 0 ? 0 : -8,
                              zIndex: 5 - i,
                            }}
                          >
                            <OwnerIcon
                              ownerId={owner.id}
                              ownerType={owner.type}
                              size="lg"
                            />
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-content-secondary">
                        (
                        {
                          selectedOwners.filter((o) => o.type === 'corporation')
                            .length
                        }
                        /{totalCorps})
                      </span>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </button>
      <OwnerManagementModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}
