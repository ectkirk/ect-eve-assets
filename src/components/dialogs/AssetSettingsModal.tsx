import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useAssetSettings,
  ASSET_SETTINGS_CONFIG,
  type AssetSettingKey,
} from '@/store/asset-settings-store'

interface AssetSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 py-2 px-2 rounded hover:bg-surface-tertiary cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 mt-0.5 rounded border-border text-accent focus:ring-accent"
      />
      <div className="flex-1">
        <div className="text-sm text-content">{label}</div>
        <div className="text-xs text-content-muted">{description}</div>
      </div>
    </label>
  )
}

export function AssetSettingsModal({
  open,
  onOpenChange,
}: AssetSettingsModalProps) {
  const settings = useAssetSettings()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asset View Settings</DialogTitle>
          <DialogDescription>
            Choose which data sources to include in asset totals
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {ASSET_SETTINGS_CONFIG.map((config) => (
            <ToggleRow
              key={config.key}
              label={config.label}
              description={config.description}
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
