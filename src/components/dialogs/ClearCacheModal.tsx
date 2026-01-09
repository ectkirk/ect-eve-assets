import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CheckboxRow } from '@/components/ui/checkbox-row'
import { useReferenceCacheStore } from '@/store/reference-cache'
import {
  loadReferenceData,
  loadUniverseData,
  loadRefStructures,
} from '@/api/ref-client'
import { useStoreRegistry } from '@/store/store-registry'
import { useRegionalMarketStore } from '@/store/regional-market-store'
import { usePriceStore } from '@/store/price-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { useAnsiblexStore } from '@/store/ansiblex-store'
import { logger } from '@/lib/logger'

interface ClearCacheModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CacheGroup = 'reference' | 'data' | 'structures' | 'system'

interface CacheOption {
  id: string
  labelKey: string
  group: CacheGroup
  requiresReload: boolean
  endpointPattern?: string
  storeNames?: string[]
  clear: () => Promise<void>
  refetch?: () => Promise<void>
}

const registry = () => useStoreRegistry.getState()
const refCache = () => useReferenceCacheStore.getState()

const CACHE_OPTIONS: CacheOption[] = [
  {
    id: 'coreReference',
    labelKey: 'clearCache.coreReference',
    group: 'reference',
    requiresReload: false,
    clear: () => refCache().clearCoreReferenceCache(),
    refetch: async () => {
      await loadReferenceData()
    },
  },
  {
    id: 'universe',
    labelKey: 'clearCache.universe',
    group: 'reference',
    requiresReload: false,
    clear: () => refCache().clearUniverseCache(),
    refetch: async () => {
      await loadUniverseData()
      await loadRefStructures()
    },
  },
  {
    id: 'locations',
    labelKey: 'clearCache.locations',
    group: 'reference',
    requiresReload: false,
    clear: () => refCache().clearLocationsCache(),
  },
  {
    id: 'playerStructures',
    labelKey: 'clearCache.playerStructures',
    group: 'reference',
    requiresReload: false,
    clear: () => refCache().clearStructuresCache(),
  },
  {
    id: 'jitaPrices',
    labelKey: 'clearCache.jitaPrices',
    group: 'reference',
    requiresReload: false,
    clear: () => usePriceStore.getState().clearJita(),
    refetch: () => usePriceStore.getState().init(),
  },
  {
    id: 'esiPrices',
    labelKey: 'clearCache.esiPrices',
    group: 'reference',
    requiresReload: false,
    clear: () => usePriceStore.getState().clearEsi(),
    refetch: () => usePriceStore.getState().refreshEsiPrices(),
  },
  {
    id: 'abyssalPrices',
    labelKey: 'clearCache.abyssalPrices',
    group: 'reference',
    requiresReload: false,
    clear: () => usePriceStore.getState().clearAbyssal(),
  },
  {
    id: 'ansiblex',
    labelKey: 'clearCache.ansiblex',
    group: 'reference',
    requiresReload: false,
    clear: () => useAnsiblexStore.getState().clear(),
  },
  {
    id: 'assets',
    labelKey: 'clearCache.assets',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/assets/',
    storeNames: ['assets'],
    clear: () => registry().clearByNames(['assets']),
    refetch: () => registry().refetchByNames(['assets']),
  },
  {
    id: 'orders',
    labelKey: 'clearCache.orders',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/orders/',
    storeNames: ['market orders'],
    clear: async () => {
      await registry().clearByNames(['market orders'])
      await useRegionalMarketStore.getState().clear()
    },
    refetch: async () => {
      await registry().refetchByNames(['market orders'])
      await useRegionalMarketStore.getState().init()
    },
  },
  {
    id: 'jobs',
    labelKey: 'clearCache.jobs',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/industry/jobs/',
    storeNames: ['industry jobs'],
    clear: () => registry().clearByNames(['industry jobs']),
    refetch: () => registry().refetchByNames(['industry jobs']),
  },
  {
    id: 'contracts',
    labelKey: 'clearCache.contracts',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/contracts/',
    storeNames: ['contracts'],
    clear: () => registry().clearByNames(['contracts']),
    refetch: () => registry().refetchByNames(['contracts']),
  },
  {
    id: 'wallet',
    labelKey: 'clearCache.wallet',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/wallet',
    storeNames: ['wallet'],
    clear: () => registry().clearByNames(['wallet']),
    refetch: () => registry().refetchByNames(['wallet']),
  },
  {
    id: 'clones',
    labelKey: 'clearCache.clones',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/clones/',
    storeNames: ['clones'],
    clear: () => registry().clearByNames(['clones']),
    refetch: () => registry().refetchByNames(['clones']),
  },
  {
    id: 'loyalty',
    labelKey: 'clearCache.loyalty',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/loyalty/points',
    storeNames: ['loyalty'],
    clear: () => registry().clearByNames(['loyalty']),
    refetch: () => registry().refetchByNames(['loyalty']),
  },
  {
    id: 'blueprints',
    labelKey: 'clearCache.blueprints',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/blueprints/',
    storeNames: ['blueprints'],
    clear: () => registry().clearByNames(['blueprints']),
    refetch: () => registry().refetchByNames(['blueprints']),
  },
  {
    id: 'ownedStructures',
    labelKey: 'clearCache.ownedStructures',
    group: 'structures',
    requiresReload: false,
    endpointPattern: '/structures',
    storeNames: ['structures'],
    clear: () => registry().clearByNames(['structures']),
    refetch: () => registry().refetchByNames(['structures']),
  },
  {
    id: 'starbases',
    labelKey: 'clearCache.starbases',
    group: 'structures',
    requiresReload: false,
    endpointPattern: '/starbases',
    storeNames: ['starbases', 'starbase details'],
    clear: () => registry().clearByNames(['starbases', 'starbase details']),
    refetch: () => registry().refetchByNames(['starbases']),
  },
  {
    id: 'esiCache',
    labelKey: 'clearCache.esiCache',
    group: 'system',
    requiresReload: true,
    clear: () => window.electronAPI?.esi.clearCache() ?? Promise.resolve(),
  },
  {
    id: 'expiry',
    labelKey: 'clearCache.expiry',
    group: 'system',
    requiresReload: false,
    clear: () => useExpiryCacheStore.getState().clear(),
  },
]

const GROUP_LABEL_KEYS: Record<CacheGroup, string> = {
  reference: 'clearCache.groups.reference',
  data: 'clearCache.groups.data',
  structures: 'clearCache.groups.structures',
  system: 'clearCache.groups.system',
}

const GROUP_ORDER: CacheGroup[] = ['reference', 'data', 'structures', 'system']

export function ClearCacheModal({ open, onOpenChange }: ClearCacheModalProps) {
  const { t } = useTranslation('dialogs')
  const { t: tc } = useTranslation('common')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isClearing, setIsClearing] = useState(false)

  const toggleOption = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(CACHE_OPTIONS.map((o) => o.id)))
  }

  const clearSelection = () => {
    setSelected(new Set())
  }

  const handleClear = async () => {
    if (selected.size === 0 || isClearing) return

    setIsClearing(true)

    const optionsToClear = CACHE_OPTIONS.filter((o) => selected.has(o.id))
    const requiresReload = optionsToClear.some((o) => o.requiresReload)

    logger.info('Clearing selected caches', {
      module: 'ClearCacheModal',
      caches: optionsToClear.map((o) => o.id),
      requiresReload,
    })

    try {
      await Promise.all(
        optionsToClear.map(async (option) => {
          if (option.endpointPattern) {
            await useExpiryCacheStore
              .getState()
              .clearByEndpoint(option.endpointPattern)
            await window.electronAPI?.esi.clearCacheByPattern(
              option.endpointPattern
            )
          }
          await option.clear()
        })
      )

      const clearsCharacterData = optionsToClear.some(
        (o) => o.group === 'data' || o.group === 'structures'
      )
      if (clearsCharacterData) {
        await useDivisionsStore.getState().clear()
      }

      if (requiresReload) {
        window.location.reload()
      } else {
        const refetchPromises = optionsToClear
          .filter((o) => o.refetch)
          .map((o) => o.refetch!())

        if (refetchPromises.length > 0) {
          await Promise.all(refetchPromises)
        }

        onOpenChange(false)
        setSelected(new Set())
      }
    } catch (err) {
      logger.error(
        'Failed to clear caches',
        err instanceof Error ? err : undefined,
        {
          module: 'ClearCacheModal',
        }
      )
    } finally {
      setIsClearing(false)
    }
  }

  const selectedRequiresReload = CACHE_OPTIONS.some(
    (o) => selected.has(o.id) && o.requiresReload
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('clearCache.title')}</DialogTitle>
          <DialogDescription>{t('clearCache.description')}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-4 pr-4">
            {GROUP_ORDER.map((group) => {
              const options = CACHE_OPTIONS.filter((o) => o.group === group)
              return (
                <div key={group}>
                  <div className="text-xs font-medium text-content-muted uppercase tracking-wider mb-2">
                    {t(GROUP_LABEL_KEYS[group])}
                  </div>
                  <div className="space-y-1">
                    {options.map((option) => (
                      <CheckboxRow
                        key={option.id}
                        label={t(option.labelKey)}
                        checked={selected.has(option.id)}
                        onChange={() => toggleOption(option.id)}
                        suffix={
                          option.requiresReload && (
                            <span className="text-xs text-semantic-warning">
                              {t('clearCache.reload')}
                            </span>
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            onClick={selectAll}
            className="text-xs text-accent hover:underline"
          >
            {tc('buttons.selectAll')}
          </button>
          <span className="text-content-muted">·</span>
          <button
            onClick={clearSelection}
            className="text-xs text-accent hover:underline"
          >
            {tc('buttons.clearSelection')}
          </button>
        </div>

        {selectedRequiresReload && (
          <div className="text-xs text-semantic-warning bg-semantic-warning/10 rounded px-3 py-2">
            {t('clearCache.reloadWarning')}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={() => onOpenChange(false)}
            disabled={isClearing}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-tertiary disabled:opacity-50"
          >
            {tc('buttons.cancel')}
          </button>
          <button
            onClick={handleClear}
            disabled={selected.size === 0 || isClearing}
            className="rounded-md bg-semantic-danger px-4 py-2 text-sm font-medium hover:bg-semantic-danger/90 disabled:opacity-50"
          >
            {isClearing
              ? tc('status.clearing')
              : t('clearCache.clearSelected', { count: selected.size })}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
