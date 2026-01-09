import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckboxRow } from '@/components/ui/checkbox-row'
import {
  useAssetSettings,
  ASSET_SETTINGS_CONFIG,
  type AssetSettingKey,
} from '@/store/asset-settings-store'

interface AssetSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AssetSettingsModal({
  open,
  onOpenChange,
}: AssetSettingsModalProps) {
  const { t } = useTranslation('dialogs')
  const settings = useAssetSettings()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('assetSettings.title')}</DialogTitle>
          <DialogDescription>
            {t('assetSettings.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {ASSET_SETTINGS_CONFIG.map((config) => (
            <CheckboxRow
              key={config.key}
              label={t(config.labelKey)}
              description={t(config.descriptionKey)}
              checked={settings[config.key]}
              onChange={(value) =>
                settings.setSetting(config.key as AssetSettingKey, value)
              }
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
