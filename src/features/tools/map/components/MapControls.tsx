import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ColorMode } from '../types'

interface MapControlsProps {
  colorMode: ColorMode
  onColorModeChange: (mode: ColorMode) => void
}

const COLOR_MODE_KEYS: Array<{ mode: ColorMode; labelKey: string }> = [
  { mode: 'region', labelKey: 'map.colorRegion' },
  { mode: 'security', labelKey: 'map.colorSecurity' },
  { mode: 'faction', labelKey: 'map.colorFaction' },
  { mode: 'alliance', labelKey: 'map.colorAlliance' },
]

export const MapControls = memo(function MapControls({
  colorMode,
  onColorModeChange,
}: MapControlsProps) {
  const { t } = useTranslation('tools')
  return (
    <div className="absolute right-4 top-4 rounded-lg border border-border-secondary bg-surface-secondary p-3 shadow-lg">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-content-secondary">
          {t('map.colorBy')}
        </span>
        {COLOR_MODE_KEYS.map(({ mode, labelKey }) => (
          <button
            key={mode}
            onClick={() => onColorModeChange(mode)}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              colorMode === mode
                ? 'bg-accent text-white'
                : 'bg-surface-tertiary text-content-muted hover:bg-surface-tertiary/80'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
})
