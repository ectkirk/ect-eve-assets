import { memo, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IngameActionModal } from '@/components/dialogs/IngameActionModal'
import { MapSystemContextMenu } from './MapSystemContextMenu'
import { SystemInput } from './SystemInput'
import { ToggleOption } from './ToggleOption'
import { CorruptionBadge } from './MapInsurgencyPanel'
import type { RoutePreference } from '../utils/pathfinder'
import type { IndexedSystemItem } from '../types'
import { formatSecurity, roundSecurity } from '@/lib/utils'
import { useSystemContextMenu } from '../hooks/useSystemContextMenu'

function getSecurityClass(security: number): 'high' | 'low' | 'null' {
  if (security >= 0.45) return 'high'
  if (security > 0) return 'low'
  return 'null'
}

function isBorderSystem(systems: RouteSystemInfo[], index: number): boolean {
  if (index >= systems.length - 1) return false
  const current = systems[index]!
  const next = systems[index + 1]!
  return getSecurityClass(current.security) !== getSecurityClass(next.security)
}

export interface RouteSystemInfo {
  id: number
  name: string
  security: number
}

export interface SystemSearchItem {
  id: number
  name: string
  security: number
}

interface MapRouteControlsProps {
  originName: string | null
  originSecurity: number | null
  destinationName: string | null
  destinationSecurity: number | null
  routeSystems: RouteSystemInfo[]
  routeNotFound: boolean
  jumps: number | null
  ansiblexJumps: number | null
  routePreference: RoutePreference
  systems: SystemSearchItem[]
  ansiblexRoutingEnabled: boolean
  useAnsiblexes: boolean
  ansiblexCount: number
  showCharacterLocations: boolean
  characterLocationCount: number
  showIncursions: boolean
  incursionSystemCount: number
  showInsurgencies: boolean
  insurgencySystemCount: number
  ignoredSystemsCount: number
  isSystemIgnored: (systemId: number) => boolean
  isSystemInIncursion: (systemId: number) => boolean
  getCorruptionLevel: (systemId: number) => number | null
  onRoutePreferenceChange: (pref: RoutePreference) => void
  onOpenIgnoredSystems: () => void
  onIgnoreSystem: (systemId: number) => void
  onUnignoreSystem: (systemId: number) => void
  onUseAnsiblexesChange: (use: boolean) => void
  onShowCharacterLocationsChange: (show: boolean) => void
  onShowIncursionsChange: (show: boolean) => void
  onShowInsurgenciesChange: (show: boolean) => void
  onSetOrigin: (systemId: number) => void
  onSetDestination: (systemId: number) => void
  onClear: () => void
}

const ROUTE_PREFERENCE_KEYS: Array<{
  pref: RoutePreference
  labelKey: string
}> = [
  { pref: 'shorter', labelKey: 'map.shortest' },
  { pref: 'safer', labelKey: 'map.safer' },
  { pref: 'less-secure', labelKey: 'map.lessSecure' },
]

const SEC_BG: Record<number, string> = {
  10: 'bg-sec-10',
  9: 'bg-sec-9',
  8: 'bg-sec-8',
  7: 'bg-sec-7',
  6: 'bg-sec-6',
  5: 'bg-sec-5',
  4: 'bg-sec-4',
  3: 'bg-sec-3',
  2: 'bg-sec-2',
  1: 'bg-sec-1',
  0: 'bg-sec-0',
}

export function SecurityBadge({ security }: { security: number }) {
  const rounded = roundSecurity(security)
  const secKey = Math.max(0, Math.min(10, Math.round(rounded * 10)))
  const bg = SEC_BG[secKey] ?? SEC_BG[0]
  return (
    <span
      className={`ml-1 rounded px-1 text-xs font-medium text-sec-foreground ${bg}`}
    >
      {formatSecurity(security)}
    </span>
  )
}

export const MapRouteControls = memo(function MapRouteControls({
  originName,
  originSecurity,
  destinationName,
  destinationSecurity,
  routeSystems,
  routeNotFound,
  jumps,
  ansiblexJumps,
  routePreference,
  systems,
  ansiblexRoutingEnabled,
  useAnsiblexes,
  ansiblexCount,
  showCharacterLocations,
  characterLocationCount,
  showIncursions,
  incursionSystemCount,
  showInsurgencies,
  insurgencySystemCount,
  ignoredSystemsCount,
  isSystemIgnored,
  isSystemInIncursion,
  getCorruptionLevel,
  onRoutePreferenceChange,
  onOpenIgnoredSystems,
  onIgnoreSystem,
  onUnignoreSystem,
  onUseAnsiblexesChange,
  onShowCharacterLocationsChange,
  onShowIncursionsChange,
  onShowInsurgenciesChange,
  onSetOrigin,
  onSetDestination,
  onClear,
}: MapRouteControlsProps) {
  const { t } = useTranslation('tools')
  const [expanded, setExpanded] = useState(true)

  const { contextMenuProps, waypointModalProps, openContextMenu } =
    useSystemContextMenu({
      isIgnored: isSystemIgnored,
      onSetOrigin,
      onSetDestination,
      onIgnore: onIgnoreSystem,
      onUnignore: onUnignoreSystem,
    })

  const indexedSystems = useMemo<IndexedSystemItem[]>(
    () => systems.map((s) => ({ ...s, nameLower: s.name.toLowerCase() })),
    [systems]
  )

  return (
    <div className="absolute bottom-4 left-4 max-h-[60vh] w-64 overflow-hidden rounded-lg border border-border-secondary bg-surface-secondary shadow-lg">
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-content-primary">
            {t('map.route')}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenIgnoredSystems}
              className="text-xs text-content-secondary hover:text-content"
            >
              {t('map.ignoredSystems.title')}
              {ignoredSystemsCount > 0 && (
                <span className="ml-1 text-semantic-warning">
                  ({ignoredSystemsCount})
                </span>
              )}
            </button>
            {(originName || destinationName) && (
              <button
                onClick={onClear}
                className="text-xs text-content-muted hover:text-content-secondary"
              >
                {t('map.clear')}
              </button>
            )}
          </div>
        </div>

        <div className="mb-3 space-y-2">
          <SystemInput
            placeholder={t('map.originPlaceholder')}
            selectedName={originName}
            selectedSecurity={originSecurity}
            dotColor="#00ff88"
            indexedSystems={indexedSystems}
            onSelect={onSetOrigin}
          />
          <SystemInput
            placeholder={t('map.destinationPlaceholder')}
            selectedName={destinationName}
            selectedSecurity={destinationSecurity}
            dotColor="#ff4444"
            indexedSystems={indexedSystems}
            onSelect={onSetDestination}
          />
        </div>

        {routeNotFound && (
          <div className="mb-3 rounded bg-semantic-danger/10 px-3 py-2 text-sm text-semantic-danger">
            {t('map.noRouteFound')}
          </div>
        )}

        {jumps !== null && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-medium text-content-primary">
              {t('map.jump', { count: jumps })}
              {ansiblexJumps !== null && ansiblexJumps > 0 && (
                <span className="ml-1 text-xs text-accent">
                  {t('map.ansiblexCount', { count: ansiblexJumps })}
                </span>
              )}
            </span>
            {routeSystems.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-accent hover:text-accent/80"
              >
                {expanded ? t('map.hideRoute') : t('map.showRoute')}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {ROUTE_PREFERENCE_KEYS.map(({ pref, labelKey }) => (
            <button
              key={pref}
              onClick={() => onRoutePreferenceChange(pref)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                routePreference === pref
                  ? 'bg-accent text-white'
                  : 'bg-surface-tertiary text-content-muted hover:bg-surface-tertiary/80'
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {ansiblexRoutingEnabled && ansiblexCount > 0 && (
          <ToggleOption
            checked={useAnsiblexes}
            onChange={onUseAnsiblexesChange}
            label={t('map.useAnsiblexes')}
            count={ansiblexCount}
          />
        )}

        <ToggleOption
          checked={showCharacterLocations}
          onChange={onShowCharacterLocationsChange}
          label={t('map.showCharacterLocations')}
          count={characterLocationCount}
        />

        <ToggleOption
          checked={showIncursions}
          onChange={onShowIncursionsChange}
          label={t('map.showIncursions')}
          count={incursionSystemCount}
          countColorClass="text-semantic-danger"
        />

        <ToggleOption
          checked={showInsurgencies}
          onChange={onShowInsurgenciesChange}
          label={t('map.showInsurgencies')}
          count={insurgencySystemCount}
          countColorClass="text-semantic-warning"
        />
      </div>

      {expanded && routeSystems.length > 0 && (
        <div className="max-h-[30vh] overflow-y-auto border-t border-border-secondary px-3 py-2">
          <div className="space-y-0.5 text-xs">
            {routeSystems.map((system, index) => (
              <div
                key={system.id}
                className="flex cursor-context-menu items-center gap-2 rounded px-1 hover:bg-surface-tertiary"
                onContextMenu={(e) =>
                  openContextMenu(e, system.id, system.name)
                }
              >
                <span className="w-5 text-right text-content-muted">
                  {index}
                </span>
                <span className="text-content-secondary">{system.name}</span>
                <SecurityBadge security={system.security} />
                {isBorderSystem(routeSystems, index) && (
                  <span className="text-semantic-warning">
                    {t('map.border')}
                  </span>
                )}
                {isSystemInIncursion(system.id) && (
                  <span className="text-semantic-danger">
                    {t('map.incursion')}
                  </span>
                )}
                {(() => {
                  const level = getCorruptionLevel(system.id)
                  if (level === null) return null
                  return (
                    <span className="flex items-center gap-1 text-semantic-warning">
                      {t('map.insurgency')} <CorruptionBadge level={level} />
                    </span>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {contextMenuProps && <MapSystemContextMenu {...contextMenuProps} />}
      <IngameActionModal {...waypointModalProps} />
    </div>
  )
})
