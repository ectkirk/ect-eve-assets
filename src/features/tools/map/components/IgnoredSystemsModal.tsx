import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useIgnoredSystemsStore } from '@/store/ignored-systems-store'
import { useIncursionsStore } from '@/store/incursions-store'
import { useInsurgenciesStore } from '@/store/insurgencies-store'
import { SecurityBadge } from './MapRouteControls'

interface IgnoredSystemsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  systems: Array<{ id: number; name: string; security: number }>
}

export function IgnoredSystemsModal({
  open,
  onOpenChange,
  systems,
}: IgnoredSystemsModalProps) {
  const { t } = useTranslation('tools')
  const [searchQuery, setSearchQuery] = useState('')

  const {
    ignoredSystems,
    avoidIncursions,
    avoidInsurgencies,
    addIgnored,
    removeIgnored,
    clearAll,
    setAvoidIncursions,
    setAvoidInsurgencies,
  } = useIgnoredSystemsStore()

  const { infestedSystems } = useIncursionsStore()
  const { affectedSystems: insurgencySystems } = useInsurgenciesStore()

  const systemMap = useMemo(
    () => new Map(systems.map((s) => [s.id, s])),
    [systems]
  )

  const ignoredList = useMemo(() => {
    return [...ignoredSystems]
      .map((id) => systemMap.get(id))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [ignoredSystems, systemMap])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase()
    return systems
      .filter(
        (s) => s.name.toLowerCase().includes(query) && !ignoredSystems.has(s.id)
      )
      .slice(0, 10)
  }, [searchQuery, systems, ignoredSystems])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('map.ignoredSystems.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('map.ignoredSystems.searchPlaceholder')}
              className="w-full rounded border border-border bg-surface-primary py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="rounded border border-border bg-surface-primary">
              {searchResults.map((system) => (
                <button
                  key={system.id}
                  onClick={() => {
                    addIgnored(system.id)
                    setSearchQuery('')
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-tertiary"
                >
                  <span>{system.name}</span>
                  <SecurityBadge security={system.security} />
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={avoidIncursions}
                onChange={(e) => setAvoidIncursions(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm text-content-secondary">
                {t('map.ignoredSystems.avoidIncursions')}
                {infestedSystems.size > 0 && (
                  <span className="ml-1 text-semantic-danger">
                    ({infestedSystems.size})
                  </span>
                )}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={avoidInsurgencies}
                onChange={(e) => setAvoidInsurgencies(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm text-content-secondary">
                {t('map.ignoredSystems.avoidInsurgencies')}
                {insurgencySystems.size > 0 && (
                  <span className="ml-1 text-semantic-warning">
                    ({insurgencySystems.size})
                  </span>
                )}
              </span>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-content-secondary">
              {t('map.ignoredSystems.count', { count: ignoredList.length })}
            </span>
            {ignoredList.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-semantic-danger hover:underline"
              >
                {t('map.ignoredSystems.clearAll')}
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto rounded border border-border">
            {ignoredList.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-content-muted">
                {t('map.ignoredSystems.empty')}
              </div>
            ) : (
              ignoredList.map((system) => (
                <div
                  key={system.id}
                  className="flex items-center justify-between border-b border-border px-3 py-2 last:border-b-0"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{system.name}</span>
                    <SecurityBadge security={system.security} />
                  </div>
                  <button
                    onClick={() => removeIgnored(system.id)}
                    className="rounded p-1 text-content-muted hover:bg-surface-tertiary hover:text-semantic-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
