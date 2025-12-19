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
  clearTypesCache,
  clearLocationsCache,
  clearStructuresCache,
  clearAbyssalsCache,
} from '@/store/reference-cache'
import { useAssetStore } from '@/store/asset-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useMarketOrderHistoryStore } from '@/store/market-order-history-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useContractsStore } from '@/store/contracts-store'
import { useWalletStore } from '@/store/wallet-store'
import { useWalletJournalStore } from '@/store/wallet-journal-store'
import { useClonesStore } from '@/store/clones-store'
import { useLoyaltyStore } from '@/store/loyalty-store'
import { useBlueprintsStore } from '@/store/blueprints-store'
import { useStructuresStore } from '@/store/structures-store'
import { useStarbasesStore } from '@/store/starbases-store'
import { useStarbaseDetailsStore } from '@/store/starbase-details-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { logger } from '@/lib/logger'

interface ClearCacheModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CacheOption {
  id: string
  label: string
  group: 'reference' | 'data' | 'structures' | 'system'
  requiresReload: boolean
  endpointPattern?: string
  clear: () => Promise<void>
  refetch?: () => Promise<void>
}

const CACHE_OPTIONS: CacheOption[] = [
  {
    id: 'types',
    label: 'Item Types',
    group: 'reference',
    requiresReload: true,
    clear: clearTypesCache,
  },
  {
    id: 'locations',
    label: 'Location Names',
    group: 'reference',
    requiresReload: true,
    clear: clearLocationsCache,
  },
  {
    id: 'playerStructures',
    label: 'Structure Names',
    group: 'reference',
    requiresReload: true,
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
    clear: () => useAssetStore.getState().clear(),
    refetch: async () => {
      await useAssetStore.getState().init()
      await useAssetStore.getState().update(true)
    },
  },
  {
    id: 'orders',
    label: 'Market Orders',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/orders/',
    clear: async () => {
      await useMarketOrdersStore.getState().clear()
      await useMarketOrderHistoryStore.getState().clear()
    },
    refetch: async () => {
      await useMarketOrdersStore.getState().init()
      await useMarketOrdersStore.getState().update(true)
      await useMarketOrderHistoryStore.getState().init()
      await useMarketOrderHistoryStore.getState().update(true)
    },
  },
  {
    id: 'jobs',
    label: 'Industry Jobs',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/industry/jobs/',
    clear: () => useIndustryJobsStore.getState().clear(),
    refetch: async () => {
      await useIndustryJobsStore.getState().init()
      await useIndustryJobsStore.getState().update(true)
    },
  },
  {
    id: 'contracts',
    label: 'Contracts',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/contracts/',
    clear: () => useContractsStore.getState().clear(),
    refetch: async () => {
      await useContractsStore.getState().init()
      await useContractsStore.getState().update(true)
    },
  },
  {
    id: 'wallet',
    label: 'Wallet & Journal',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/wallet',
    clear: async () => {
      await useWalletStore.getState().clear()
      await useWalletJournalStore.getState().clear()
    },
    refetch: async () => {
      await useWalletStore.getState().init()
      await useWalletStore.getState().update(true)
      await useWalletJournalStore.getState().init()
      await useWalletJournalStore.getState().update(true)
    },
  },
  {
    id: 'clones',
    label: 'Clones',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/clones/',
    clear: () => useClonesStore.getState().clear(),
    refetch: async () => {
      await useClonesStore.getState().init()
      await useClonesStore.getState().update(true)
    },
  },
  {
    id: 'loyalty',
    label: 'Loyalty Points',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/loyalty/points',
    clear: () => useLoyaltyStore.getState().clear(),
    refetch: async () => {
      await useLoyaltyStore.getState().init()
      await useLoyaltyStore.getState().update(true)
    },
  },
  {
    id: 'blueprints',
    label: 'Blueprints',
    group: 'data',
    requiresReload: false,
    endpointPattern: '/blueprints/',
    clear: () => useBlueprintsStore.getState().clear(),
    refetch: async () => {
      await useBlueprintsStore.getState().init()
      await useBlueprintsStore.getState().update(true)
    },
  },
  {
    id: 'ownedStructures',
    label: 'Owned Structures',
    group: 'structures',
    requiresReload: false,
    endpointPattern: '/structures',
    clear: () => useStructuresStore.getState().clear(),
    refetch: async () => {
      await useStructuresStore.getState().init()
      await useStructuresStore.getState().update(true)
    },
  },
  {
    id: 'starbases',
    label: 'Starbases (POS)',
    group: 'structures',
    requiresReload: false,
    endpointPattern: '/starbases',
    clear: async () => {
      await useStarbasesStore.getState().clear()
      await useStarbaseDetailsStore.getState().clear()
    },
    refetch: async () => {
      await useStarbasesStore.getState().init()
      await useStarbasesStore.getState().update(true)
    },
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

const GROUP_LABELS: Record<CacheOption['group'], string> = {
  reference: 'Reference Data',
  data: 'Character & Corporation Data',
  structures: 'Structure Ownership',
  system: 'System Caches',
}

const GROUP_ORDER: CacheOption['group'][] = ['reference', 'data', 'structures', 'system']

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
            await useExpiryCacheStore.getState().clearByEndpoint(option.endpointPattern)
            await window.electronAPI?.esi.clearCacheByPattern(option.endpointPattern)
          }
          await option.clear()
        })
      )

      const clearsCharacterData = optionsToClear.some((o) => o.group === 'data' || o.group === 'structures')
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
      logger.error('Failed to clear caches', err instanceof Error ? err : undefined, {
        module: 'ClearCacheModal',
      })
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
                          <span className="text-xs text-semantic-warning">reload</span>
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
