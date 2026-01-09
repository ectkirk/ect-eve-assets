import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { IncursionInfo } from '@/store/incursions-store'
import { MapEventPanel } from './MapEventPanel'
import { SecurityBadge } from './MapRouteControls'

interface MapIncursionPanelProps {
  incursions: IncursionInfo[]
  systemMap: Map<number, { id: number; name: string; security: number }>
  isIgnored: (systemId: number) => boolean
  onSetOrigin: (systemId: number) => void
  onSetDestination: (systemId: number) => void
  onIgnore: (systemId: number) => void
  onUnignore: (systemId: number) => void
}

function StateBadge({ state }: { state: IncursionInfo['state'] }) {
  const colors: Record<string, string> = {
    established: 'bg-red-800 text-red-100',
    mobilizing: 'bg-orange-700 text-orange-100',
    withdrawing: 'bg-green-700 text-green-100',
  }
  const bg = colors[state] ?? colors.established
  return (
    <span className={`rounded px-1.5 text-xs font-medium capitalize ${bg}`}>
      {state}
    </span>
  )
}

export const MapIncursionPanel = memo(function MapIncursionPanel({
  incursions,
  systemMap,
  isIgnored,
  onSetOrigin,
  onSetDestination,
  onIgnore,
  onUnignore,
}: MapIncursionPanelProps) {
  const { t } = useTranslation('tools')

  return (
    <MapEventPanel
      title={t('map.incursionPanel.title')}
      count={incursions.length}
      countColorClass="text-semantic-danger"
      position="right-64"
      isIgnored={isIgnored}
      onSetOrigin={onSetOrigin}
      onSetDestination={onSetDestination}
      onIgnore={onIgnore}
      onUnignore={onUnignore}
    >
      {(openContextMenu) => (
        <div className="space-y-2 text-xs">
          {incursions.map((inc) => {
            const stagingSystem = systemMap.get(inc.stagingSystemId)
            const systemName =
              stagingSystem?.name ?? `System ${inc.stagingSystemId}`
            return (
              <div
                key={inc.constellationId}
                className="cursor-context-menu rounded border border-border bg-surface-primary p-2 hover:bg-surface-tertiary"
                onContextMenu={(e) =>
                  openContextMenu(e, inc.stagingSystemId, systemName)
                }
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-0.5 truncate">
                    <span className="truncate font-medium text-content-primary">
                      {systemName}
                    </span>
                    {stagingSystem && (
                      <SecurityBadge security={stagingSystem.security} />
                    )}
                  </div>
                  <StateBadge state={inc.state} />
                </div>
                <div className="flex items-center justify-between text-content-muted">
                  <span>{inc.systemCount} systems</span>
                  <span>{Math.round(inc.influence * 100)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </MapEventPanel>
  )
})
