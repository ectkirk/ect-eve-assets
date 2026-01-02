import { memo } from 'react'
import type { ColorMode } from '../types'

interface MapControlsProps {
  colorMode: ColorMode
  onColorModeChange: (mode: ColorMode) => void
}

const COLOR_MODES: Array<{ mode: ColorMode; label: string }> = [
  { mode: 'region', label: 'Region' },
  { mode: 'security', label: 'Security' },
  { mode: 'faction', label: 'Faction Warfare' },
  { mode: 'alliance', label: 'Alliance Sovereignty' },
]

export const MapControls = memo(function MapControls({
  colorMode,
  onColorModeChange,
}: MapControlsProps) {
  return (
    <div className="absolute right-4 top-4 rounded-lg border border-border-secondary bg-surface-secondary p-3 shadow-lg">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-content-secondary">
          Color by:
        </span>
        {COLOR_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => onColorModeChange(mode)}
            className={`rounded px-3 py-1 text-sm transition-colors ${
              colorMode === mode
                ? 'bg-accent text-white'
                : 'bg-surface-tertiary text-content-muted hover:bg-surface-tertiary/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
})
