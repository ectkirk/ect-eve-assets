import { useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { OwnerIcon } from '@/components/ui/type-icon'
import {
  postAutopilotWaypoint,
  postOpenContract,
  postOpenMarketDetails,
} from '@/api/endpoints/ui'

type IngameAction = 'autopilot' | 'contract' | 'market'

interface IngameActionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: IngameAction
  targetId: number
  targetName?: string
  autopilotOptions?: { addToBeginning?: boolean; clearOthers?: boolean }
  eligibleCharacterIds?: number[]
}

const REQUIRED_SCOPES: Record<IngameAction, string> = {
  autopilot: 'esi-ui.write_waypoint.v1',
  contract: 'esi-ui.open_window.v1',
  market: 'esi-ui.open_window.v1',
}

export function IngameActionModal({
  open,
  onOpenChange,
  action,
  targetId,
  targetName,
  autopilotOptions,
  eligibleCharacterIds,
}: IngameActionModalProps) {
  const { t } = useTranslation('dialogs')
  const owners = useAuthStore((s) => s.owners)
  const ownerHasScope = useAuthStore((s) => s.ownerHasScope)
  const setOwnerScopesOutdated = useAuthStore((s) => s.setOwnerScopesOutdated)

  const requiredScope = REQUIRED_SCOPES[action]

  const eligibleCharacters = useMemo(() => {
    return Object.values(owners).filter((owner) => {
      if (owner.type !== 'character') return false
      if (owner.authFailed) return false
      if (eligibleCharacterIds && !eligibleCharacterIds.includes(owner.id))
        return false
      const key = ownerKey(owner.type, owner.id)
      return ownerHasScope(key, requiredScope)
    })
  }, [owners, ownerHasScope, requiredScope, eligibleCharacterIds])

  useEffect(() => {
    if (!open) return
    for (const owner of Object.values(owners)) {
      if (owner.type !== 'character') continue
      if (owner.authFailed || owner.scopesOutdated) continue
      if (eligibleCharacterIds && !eligibleCharacterIds.includes(owner.id))
        continue
      const key = ownerKey(owner.type, owner.id)
      if (!ownerHasScope(key, requiredScope)) {
        setOwnerScopesOutdated(key, true)
      }
    }
  }, [
    open,
    owners,
    ownerHasScope,
    requiredScope,
    setOwnerScopesOutdated,
    eligibleCharacterIds,
  ])

  const handleExecute = (characterId: number) => {
    switch (action) {
      case 'autopilot':
        postAutopilotWaypoint(characterId, targetId, autopilotOptions)
        break
      case 'contract':
        postOpenContract(characterId, targetId)
        break
      case 'market':
        postOpenMarketDetails(characterId, targetId)
        break
    }
    onOpenChange(false)
  }

  const title = t(`ingameAction.title.${action}`)
  const hasEligible = eligibleCharacters.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {targetName
              ? `${t('ingameAction.selectCharacter')} - ${targetName}`
              : t('ingameAction.selectCharacter')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          {hasEligible ? (
            eligibleCharacters.map((char) => (
              <button
                key={char.id}
                onClick={() => handleExecute(char.id)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-tertiary"
              >
                <OwnerIcon ownerId={char.id} ownerType="character" size="lg" />
                <span className="flex-1 text-sm">{char.name}</span>
              </button>
            ))
          ) : (
            <div className="py-4 text-center text-sm text-content-muted">
              <p>{t('ingameAction.noCharacters')}</p>
              <p className="mt-1 text-xs">{t('ingameAction.requiresReauth')}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
