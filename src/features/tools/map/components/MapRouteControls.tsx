import { memo, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoutePreference } from '../utils/pathfinder'
import { formatSecurity, roundSecurity } from '@/lib/utils'
import { useDebounce } from '../hooks/useDebounce'

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

interface IndexedSystemItem extends SystemSearchItem {
  nameLower: string
}

interface MapRouteControlsProps {
  originName: string | null
  originSecurity: number | null
  destinationName: string | null
  destinationSecurity: number | null
  routeSystems: RouteSystemInfo[]
  jumps: number | null
  ansiblexJumps: number | null
  routePreference: RoutePreference
  systems: SystemSearchItem[]
  ansiblexRoutingEnabled: boolean
  useAnsiblexes: boolean
  ansiblexCount: number
  onRoutePreferenceChange: (pref: RoutePreference) => void
  onUseAnsiblexesChange: (use: boolean) => void
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

function SecurityBadge({ security }: { security: number }) {
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

const DEBOUNCE_MS = 200
const MAX_RESULTS = 8

interface SystemInputProps {
  placeholder: string
  selectedName: string | null
  selectedSecurity: number | null
  dotColor: string
  indexedSystems: IndexedSystemItem[]
  onSelect: (systemId: number) => void
}

function SystemInput({
  placeholder,
  selectedName,
  selectedSecurity,
  dotColor,
  indexedSystems,
  onSelect,
}: SystemInputProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SystemSearchItem[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const performSearch = useDebounce((searchQuery: string) => {
    const lower = searchQuery.toLowerCase()
    const matches: SystemSearchItem[] = []
    for (const sys of indexedSystems) {
      if (sys.nameLower.includes(lower)) {
        matches.push(sys)
        if (matches.length >= MAX_RESULTS) break
      }
    }
    setResults(matches)
    setShowDropdown(matches.length > 0)
  }, DEBOUNCE_MS)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value
      setQuery(newQuery)

      if (!newQuery.trim()) {
        setResults([])
        setShowDropdown(false)
        return
      }

      performSearch(newQuery)
    },
    [performSearch]
  )

  const handleSelect = useCallback(
    (sys: SystemSearchItem) => {
      onSelect(sys.id)
      setQuery('')
      setResults([])
      setShowDropdown(false)
      setIsEditing(false)
    },
    [onSelect]
  )

  const handleFocus = useCallback(() => {
    setIsEditing(true)
    if (results.length > 0) setShowDropdown(true)
  }, [results.length])

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setShowDropdown(false)
      setIsEditing(false)
      setQuery('')
    }, 150)
  }, [])

  return (
    <div className="relative flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {isEditing || !selectedName ? (
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="w-full rounded border border-border-secondary bg-surface-tertiary px-2 py-1 text-xs text-content placeholder-content-muted focus:border-accent focus:outline-none"
          />
          {showDropdown && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded border border-border-secondary bg-surface-secondary shadow-lg">
              {results.map((sys) => (
                <button
                  key={sys.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(sys)
                  }}
                  className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-surface-tertiary"
                >
                  <span className="text-content-secondary">{sys.name}</span>
                  <SecurityBadge security={sys.security} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="flex-1 text-left text-sm text-content-secondary hover:text-content-primary"
        >
          {selectedName}
          {selectedSecurity !== null && (
            <SecurityBadge security={selectedSecurity} />
          )}
        </button>
      )}
    </div>
  )
}

export const MapRouteControls = memo(function MapRouteControls({
  originName,
  originSecurity,
  destinationName,
  destinationSecurity,
  routeSystems,
  jumps,
  ansiblexJumps,
  routePreference,
  systems,
  ansiblexRoutingEnabled,
  useAnsiblexes,
  ansiblexCount,
  onRoutePreferenceChange,
  onUseAnsiblexesChange,
  onSetOrigin,
  onSetDestination,
  onClear,
}: MapRouteControlsProps) {
  const { t } = useTranslation('tools')
  const [expanded, setExpanded] = useState(false)

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
          {(originName || destinationName) && (
            <button
              onClick={onClear}
              className="text-xs text-content-muted hover:text-content-secondary"
            >
              {t('map.clear')}
            </button>
          )}
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

        {ansiblexRoutingEnabled && (
          <label className="mt-2 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useAnsiblexes}
              onChange={(e) => onUseAnsiblexesChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-xs text-content-secondary">
              {t('map.useAnsiblexes')}
              {ansiblexCount > 0 && (
                <span className="ml-1 text-content-muted">
                  ({ansiblexCount})
                </span>
              )}
            </span>
          </label>
        )}
      </div>

      {expanded && routeSystems.length > 0 && (
        <div className="max-h-[30vh] overflow-y-auto border-t border-border-secondary px-3 py-2">
          <div className="space-y-0.5 text-xs">
            {routeSystems.map((system, index) => (
              <div key={system.id} className="flex items-center gap-2">
                <span className="w-5 text-right text-content-muted">
                  {index}
                </span>
                <span className="text-content-secondary">{system.name}</span>
                <SecurityBadge security={system.security} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
