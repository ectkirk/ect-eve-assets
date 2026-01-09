import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { InsurgencySystemInfo } from '@/store/insurgencies-store'
import { MapEventPanel } from './MapEventPanel'
import { SecurityBadge } from './MapRouteControls'

interface MapInsurgencyPanelProps {
  systems: InsurgencySystemInfo[]
  isIgnored: (systemId: number) => boolean
  onSetOrigin: (systemId: number) => void
  onSetDestination: (systemId: number) => void
  onIgnore: (systemId: number) => void
  onUnignore: (systemId: number) => void
}

export function CorruptionBadge({ level }: { level: number }) {
  const colors: Record<number, string> = {
    5: 'bg-red-800 text-red-100',
    4: 'bg-orange-700 text-orange-100',
    3: 'bg-orange-600 text-orange-100',
    2: 'bg-yellow-700 text-yellow-100',
    1: 'bg-yellow-600 text-yellow-100',
    0: 'bg-green-700 text-green-100',
  }
  const bg = colors[level] ?? colors[0]
  return (
    <span className={`rounded px-1.5 text-xs font-medium ${bg}`}>{level}</span>
  )
}

export const MapInsurgencyPanel = memo(function MapInsurgencyPanel({
  systems,
  isIgnored,
  onSetOrigin,
  onSetDestination,
  onIgnore,
  onUnignore,
}: MapInsurgencyPanelProps) {
  const { t } = useTranslation('tools')

  return (
    <MapEventPanel
      title={t('map.insurgencyPanel.title')}
      count={systems.length}
      countColorClass="text-semantic-warning"
      position="right-4"
      isIgnored={isIgnored}
      onSetOrigin={onSetOrigin}
      onSetDestination={onSetDestination}
      onIgnore={onIgnore}
      onUnignore={onUnignore}
    >
      {(openContextMenu) => (
        <div className="space-y-1 text-xs">
          {systems.map((system) => (
            <div
              key={system.id}
              className="flex cursor-context-menu items-center justify-between rounded px-1 py-0.5 hover:bg-surface-tertiary"
              onContextMenu={(e) => openContextMenu(e, system.id, system.name)}
            >
              <div className="flex items-center gap-0.5 truncate">
                <span className="truncate text-content-secondary">
                  {system.name}
                </span>
                <SecurityBadge security={system.security} />
              </div>
              <CorruptionBadge level={system.corruptionState} />
            </div>
          ))}
        </div>
      )}
    </MapEventPanel>
  )
})
