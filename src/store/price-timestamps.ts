import { logger } from '@/lib/logger'
import { getErrorMessage } from '@/lib/errors'

const JITA_REFRESH_KEY = 'ecteveassets-jita-refresh-at'
const ESI_REFRESH_KEY = 'ecteveassets-esi-refresh-at'

export function getLastJitaRefreshAt(): number | null {
  try {
    const value = localStorage.getItem(JITA_REFRESH_KEY)
    return value ? Number(value) : null
  } catch {
    return null
  }
}

export function setLastJitaRefreshAt(timestamp: number): void {
  try {
    localStorage.setItem(JITA_REFRESH_KEY, String(timestamp))
  } catch (err) {
    logger.warn('localStorage not available for Jita refresh timestamp', {
      module: 'PriceStore',
      error: getErrorMessage(err),
    })
  }
}

export function getLastEsiRefreshAt(): number | null {
  try {
    const value = localStorage.getItem(ESI_REFRESH_KEY)
    return value ? Number(value) : null
  } catch {
    return null
  }
}

export function setLastEsiRefreshAt(timestamp: number): void {
  try {
    localStorage.setItem(ESI_REFRESH_KEY, String(timestamp))
  } catch (err) {
    logger.warn('localStorage not available for ESI refresh timestamp', {
      module: 'PriceStore',
      error: getErrorMessage(err),
    })
  }
}

export function clearJitaRefreshTimestamp(): void {
  try {
    localStorage.removeItem(JITA_REFRESH_KEY)
  } catch {
    // localStorage unavailable
  }
}

export function clearEsiRefreshTimestamp(): void {
  try {
    localStorage.removeItem(ESI_REFRESH_KEY)
  } catch {
    // localStorage unavailable
  }
}

export function clearRefreshTimestamps(): void {
  try {
    localStorage.removeItem(JITA_REFRESH_KEY)
    localStorage.removeItem(ESI_REFRESH_KEY)
  } catch (err) {
    logger.warn('localStorage not available for clearing refresh timestamps', {
      module: 'PriceStore',
      error: getErrorMessage(err),
    })
  }
}
