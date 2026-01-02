import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckboxRow } from '@/components/ui/checkbox-row'
import { useMapSettingsStore } from '@/store/map-settings-store'
import { useAuthStore } from '@/store/auth-store'

interface MapSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MapSettingsModal({
  open,
  onOpenChange,
}: MapSettingsModalProps) {
  const ansiblexCharacterIds = useMapSettingsStore(
    (s) => s.ansiblexCharacterIds
  )
  const addAnsiblexCharacter = useMapSettingsStore(
    (s) => s.addAnsiblexCharacter
  )
  const removeAnsiblexCharacter = useMapSettingsStore(
    (s) => s.removeAnsiblexCharacter
  )
  const owners = useAuthStore((s) => s.owners)

  const characters = useMemo(() => {
    return Object.values(owners)
      .filter((o) => o.type === 'character')
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [owners])

  const handleToggle = (characterId: string, checked: boolean) => {
    if (checked) {
      addAnsiblexCharacter(characterId)
    } else {
      removeAnsiblexCharacter(characterId)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Map Settings</DialogTitle>
          <DialogDescription>
            Configure map and routing features
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-content-primary mb-2">
              Ansiblex Routing
            </h3>
            <p className="text-xs text-content-muted mb-3">
              Select characters to use for discovering Ansiblexes. Characters in
              the same corporation share access, so only one per corp is needed.
            </p>

            {characters.length === 0 ? (
              <p className="text-xs text-content-muted italic">
                No characters available
              </p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {characters.map((char) => (
                  <CheckboxRow
                    key={char.id}
                    label={char.name}
                    checked={ansiblexCharacterIds.includes(
                      `character-${char.id}`
                    )}
                    onChange={(checked) =>
                      handleToggle(`character-${char.id}`, checked)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
