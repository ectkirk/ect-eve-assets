import { logger } from '@/lib/logger'
import {
  getNextWednesday8amGMT,
  JITA_REFRESH_INTERVAL_MS,
} from './price-refresh-schedule'

let jitaRefreshInterval: ReturnType<typeof setInterval> | null = null
let esiRefreshTimer: ReturnType<typeof setTimeout> | null = null

interface PriceStoreActions {
  refreshEsiPrices: () => Promise<void>
}

export function scheduleEsiRefresh(store: PriceStoreActions): void {
  if (esiRefreshTimer) {
    clearTimeout(esiRefreshTimer)
  }

  const nextUpdate = getNextWednesday8amGMT()
  const msUntilUpdate = nextUpdate.getTime() - Date.now()
  const maxTimeout = 2147483647

  if (msUntilUpdate > maxTimeout) {
    esiRefreshTimer = setTimeout(() => scheduleEsiRefresh(store), maxTimeout)
    return
  }

  logger.info('ESI prices update scheduled', {
    module: 'PriceStore',
    nextUpdate: nextUpdate.toISOString(),
  })

  esiRefreshTimer = setTimeout(() => {
    store.refreshEsiPrices()
    scheduleEsiRefresh(store)
  }, msUntilUpdate)
}

export function startJitaRefreshTimer(
  triggerImmediateIfStale: boolean,
  triggerFn: () => Promise<void>
): void {
  if (jitaRefreshInterval) return

  if (triggerImmediateIfStale) {
    triggerFn()
  }

  jitaRefreshInterval = setInterval(triggerFn, JITA_REFRESH_INTERVAL_MS)
}

export function stopPriceRefreshTimers(): void {
  if (jitaRefreshInterval) {
    clearInterval(jitaRefreshInterval)
    jitaRefreshInterval = null
  }
  if (esiRefreshTimer) {
    clearTimeout(esiRefreshTimer)
    esiRefreshTimer = null
  }
}

export function clearInitPromise(): void {
  // Used by price-store to reset initialization state
}
