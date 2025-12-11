import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
import { useBlueprintsStore } from '@/store/blueprints-store'
import { useClonesStore } from '@/store/clones-store'
import { useContractsStore } from '@/store/contracts-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useWalletStore } from '@/store/wallet-store'
import { logger } from '@/lib/logger'

const CHECK_INTERVAL_MS = 5000

const STORES = [
  { name: 'assets', getState: () => useAssetStore.getState() },
  { name: 'blueprints', getState: () => useBlueprintsStore.getState() },
  { name: 'clones', getState: () => useClonesStore.getState() },
  { name: 'contracts', getState: () => useContractsStore.getState() },
  { name: 'industryJobs', getState: () => useIndustryJobsStore.getState() },
  { name: 'marketOrders', getState: () => useMarketOrdersStore.getState() },
  { name: 'wallet', getState: () => useWalletStore.getState() },
] as const

export function useAutoRefresh() {
  const hasOwners = useAuthStore((s) => Object.keys(s.owners).length > 0)
  const updatingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!hasOwners) return

    const checkAndRefresh = async () => {
      for (const { name, getState } of STORES) {
        if (updatingRef.current.has(name)) continue

        const state = getState()
        if (state.isUpdating) continue

        updatingRef.current.add(name)

        try {
          await state.update(false)
        } catch (error) {
          logger.error('Auto-refresh failed', error instanceof Error ? error : undefined, {
            module: 'AutoRefresh',
            store: name,
          })
        } finally {
          updatingRef.current.delete(name)
        }
      }
    }

    checkAndRefresh()
    const interval = setInterval(checkAndRefresh, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [hasOwners])
}
