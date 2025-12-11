import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { useAssetStore } from '@/store/asset-store'
import { useBlueprintsStore } from '@/store/blueprints-store'
import { useClonesStore } from '@/store/clones-store'
import { useContractsStore } from '@/store/contracts-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useWalletStore } from '@/store/wallet-store'
import { useStructuresStore } from '@/store/structures-store'
import { logger } from '@/lib/logger'

const MIN_REFRESH_DELAY_MS = 1000

const STORES = [
  { name: 'assets', getState: () => useAssetStore.getState() },
  { name: 'blueprints', getState: () => useBlueprintsStore.getState() },
  { name: 'clones', getState: () => useClonesStore.getState() },
  { name: 'contracts', getState: () => useContractsStore.getState() },
  { name: 'industryJobs', getState: () => useIndustryJobsStore.getState() },
  { name: 'marketOrders', getState: () => useMarketOrdersStore.getState() },
  { name: 'wallet', getState: () => useWalletStore.getState() },
  { name: 'structures', getState: () => useStructuresStore.getState() },
] as const

export function useAutoRefresh() {
  const hasOwners = useAuthStore((s) => Object.keys(s.owners).length > 0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const updatingRef = useRef(false)

  const refreshStores = useCallback(async () => {
    if (updatingRef.current) return
    updatingRef.current = true

    try {
      for (const { name, getState } of STORES) {
        const state = getState()
        if (state.isUpdating) continue

        try {
          await state.update(false)
        } catch (error) {
          logger.error('Auto-refresh failed', error instanceof Error ? error : undefined, {
            module: 'AutoRefresh',
            store: name,
          })
        }
      }
    } finally {
      updatingRef.current = false
    }
  }, [])

  const scheduleNext = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const next = useExpiryCacheStore.getState().getNextExpiry()
    if (!next) return

    const delay = Math.max(MIN_REFRESH_DELAY_MS, next.expiresAt - Date.now())

    logger.debug('Scheduling next refresh', {
      module: 'AutoRefresh',
      delayMs: delay,
      expiresAt: new Date(next.expiresAt).toISOString(),
    })

    timerRef.current = setTimeout(async () => {
      await refreshStores()
      scheduleNext()
    }, delay)
  }, [refreshStores])

  useEffect(() => {
    if (!hasOwners) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    refreshStores().then(() => scheduleNext())

    const unsubscribe = useExpiryCacheStore.subscribe(() => {
      scheduleNext()
    })

    return () => {
      unsubscribe()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [hasOwners, refreshStores, scheduleNext])
}
