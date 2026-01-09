import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('dialogs')
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
          <DialogTitle>{t('mapSettings.title')}</DialogTitle>
          <DialogDescription>{t('mapSettings.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-content-primary mb-2">
              {t('mapSettings.ansiblexRouting')}
            </h3>
            <p className="text-xs text-content-muted mb-3">
              {t('mapSettings.ansiblexDescription')}
            </p>

            {characters.length === 0 ? (
              <p className="text-xs text-content-muted italic">
                {t('mapSettings.noCharacters')}
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
