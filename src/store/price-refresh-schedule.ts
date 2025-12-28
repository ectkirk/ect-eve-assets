import { getLastEsiRefreshAt, getLastJitaRefreshAt } from './price-timestamps'

export const JITA_REFRESH_INTERVAL_MS = 60 * 60 * 1000

export function getNextWednesday8amGMT(): Date {
  const now = new Date()
  const utcDay = now.getUTCDay()
  const utcHour = now.getUTCHours()

  let daysUntilWednesday = (3 - utcDay + 7) % 7
  if (daysUntilWednesday === 0 && utcHour >= 8) {
    daysUntilWednesday = 7
  }

  const next = new Date(now)
  next.setUTCDate(now.getUTCDate() + daysUntilWednesday)
  next.setUTCHours(8, 0, 0, 0)
  return next
}

export function shouldRefreshEsi(): boolean {
  const lastRefreshAt = getLastEsiRefreshAt()
  if (!lastRefreshAt) return true
  const lastRefresh = new Date(lastRefreshAt)
  const now = new Date()
  const lastWednesday = getNextWednesday8amGMT()
  lastWednesday.setUTCDate(lastWednesday.getUTCDate() - 7)
  return lastRefresh < lastWednesday && now >= lastWednesday
}

export function shouldRefreshJita(): boolean {
  const lastRefreshAt = getLastJitaRefreshAt()
  if (!lastRefreshAt) return true
  return Date.now() - lastRefreshAt > JITA_REFRESH_INTERVAL_MS
}
