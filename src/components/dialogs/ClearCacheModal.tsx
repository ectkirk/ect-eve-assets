import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  clearCoreReferenceCache,
  clearLocationsCache,
  clearStructuresCache,
  clearAbyssalsCache,
  clearUniverseCache,
} from '@/store/reference-cache'
import {
  loadReferenceData,
  loadUniverseData,
  loadRefStructures,
} from '@/api/ref-client'
import { useStoreRegistry } from '@/store/store-registry'
import { useRegionalMarketStore } from '@/store/regional-market-store'
import { useESIPricesStore } from '@/store/esi-prices-store'
import { useStarbaseDetailsStore } from '@/store/starbase-details-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { logger } from '@/lib/logger'

interface ClearCacheModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type CacheGroup = 'reference' | 'data' | 'structures' | 'system'

interface CacheOption {
  id: string
  label: string
  group: CacheGroup
  requiresReload: boolean
  endpointPattern?: string
  storeNames?: string[]
  clear: () => Promise<void>
  refetch?: () => Promise<void>
}

const registry = () => useStoreRegistry.getState()

const CACHE_OPTIONS: CacheOption[] = [
  {
    id: 'coreReference',
    label: 'Core Reference Data (Types & Blueprints)',
    group: 'reference',
    requiresReload: false,
    clear: clearCoreReferenceCache,
    refetch: loadReferenceData,
  },
  {
    id: 'universe',
    label: 'Universe Data (Regions/Systems/Stations)',
    group: 'reference',
    requiresReload: false,
    clear: clearUniverseCache,
    refetch: async () => {
      await loadUniverseData()
      await loadRefStructures()
    },
  },
  {
    id: 'locations',
    label: 'Moon Names',
    group: 'reference',
    requiresReload: false,
    clear: clearLocationsCache,
  },
  {
    id: 'playerStructures',
    label: 'Player Structure Names',
    group: 'reference',
    requiresReload: false,
    clear: clearStructuresCache,
  },
  {
    id: 'abyssals',
    label: 'Abyssal Prices',
    group: 'reference',
    requiresReload: false,
    clear: clearAbyssalsCache,
  },
  {
    id: 'assets',
    label: 'Assets',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/assets/',
    storeNames: ['assets'],
    clear: () => registry().clearByNames(['assets']),
    refetch: () => registry().refetchByNames(['assets']),
  },
  {
    id: 'orders',
    label: 'Market Orders',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/orders/',
    storeNames: ['market orders'],
    clear: async () => {
      await registry().clearByNames(['market orders'])
      await useRegionalMarketStore.getState().clear()
      await useESIPricesStore.getState().clear()
    },
    refetch: async () => {
      await registry().refetchByNames(['market orders'])
      await useRegionalMarketStore.getState().init()
      await useESIPricesStore.getState().update(true)
    },
  },
  {
    id: 'jobs',
    label: 'Industry Jobs',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/industry/jobs/',
    storeNames: ['industry jobs'],
    clear: () => registry().clearByNames(['industry jobs']),
    refetch: () => registry().refetchByNames(['industry jobs']),
  },
  {
    id: 'contracts',
    label: 'Contracts',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/contracts/',
    storeNames: ['contracts'],
    clear: () => registry().clearByNames(['contracts']),
    refetch: () => registry().refetchByNames(['contracts']),
  },
  {
    id: 'wallet',
    label: 'Wallet',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/wallet',
    storeNames: ['wallet'],
    clear: () => registry().clearByNames(['wallet']),
    refetch: () => registry().refetchByNames(['wallet']),
  },
  {
    id: 'clones',
    label: 'Clones',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/clones/',
    storeNames: ['clones'],
    clear: () => registry().clearByNames(['clones']),
    refetch: () => registry().refetchByNames(['clones']),
  },
  {
    id: 'loyalty',
    label: 'Loyalty Points',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/loyalty/points',
    storeNames: ['loyalty'],
    clear: () => registry().clearByNames(['loyalty']),
    refetch: () => registry().refetchByNames(['loyalty']),
  },
  {
    id: 'blueprints',
    label: 'Blueprints',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/blueprints/',
    storeNames: ['blueprints'],
    clear: () => registry().clearByNames(['blueprints']),
    refetch: () => registry().refetchByNames(['blueprints']),
  },
  {
    id: 'ownedStructures',
    label: 'Owned Structures',
    group: 'structures',
    requiresReload: false,
    endpointPattern: '/structures',
    storeNames: ['structures'],
    clear: () => registry().clearByNames(['structures']),
    refetch: () => registry().refetchByNames(['structures']),
  },
  {
    id: 'starbases',
    label: 'Starbases (POS)',
    group: 'structures',
    requiresReload: false,
    endpointPattern: '/starbases',
    storeNames: ['starbases'],
    clear: async () => {
      await registry().clearByNames(['starbases'])
      await useStarbaseDetailsStore.getState().clear()
    },
    refetch: () => registry().refetchByNames(['starbases']),
  },
  {
    id: 'esiCache',
    label: 'ESI Response Cache',
    group: 'system',
    requiresReload: true,
    clear: () => window.electronAPI?.esi.clearCache() ?? Promise.resolve(),
  },
  {
    id: 'expiry',
    label: 'Expiry Tracking',
    group: 'system',
    requiresReload: false,
    clear: () => useExpiryCacheStore.getState().clear(),
  },
]

const GROUP_LABELS: Record<CacheGroup, string> = {
  reference: 'Reference Data',
  data: 'Character & Corporation Data',
  structures: 'Structure Ownership',
  system: 'System Caches',
}

const GROUP_ORDER: CacheGroup[] = ['reference', 'data', 'structures', 'system']

export function ClearCacheModal({ open, onOpenChange }: ClearCacheModalProps) {
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
          <DialogTitle>Clear Cache Data</DialogTitle>
          <DialogDescription>Select which caches to clear</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-4 pr-4">
            {GROUP_ORDER.map((group) => {
              const options = CACHE_OPTIONS.filter((o) => o.group === group)
              return (
                <div key={group}>
                  <div className="text-xs font-medium text-content-muted uppercase tracking-wider mb-2">
                    {GROUP_LABELS[group]}
                  </div>
                  <div className="space-y-1">
                    {options.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-surface-tertiary cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(option.id)}
                          onChange={() => toggleOption(option.id)}
                          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                        />
                        <span className="text-sm text-content-secondary flex-1">
                          {option.label}
                        </span>
                        {option.requiresReload && (
                          <span className="text-xs text-semantic-warning">
                            reload
                          </span>
                        )}
                      </label>
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
            Select All
          </button>
          <span className="text-content-muted">·</span>
          <button
            onClick={clearSelection}
            className="text-xs text-accent hover:underline"
          >
            Clear Selection
          </button>
        </div>

        {selectedRequiresReload && (
          <div className="text-xs text-semantic-warning bg-semantic-warning/10 rounded px-3 py-2">
            The app will reload after clearing the selected caches.
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={() => onOpenChange(false)}
            disabled={isClearing}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-tertiary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleClear}
            disabled={selected.size === 0 || isClearing}
            className="rounded-md bg-semantic-danger px-4 py-2 text-sm font-medium hover:bg-semantic-danger/90 disabled:opacity-50"
          >
            {isClearing ? 'Clearing...' : `Clear Selected (${selected.size})`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
