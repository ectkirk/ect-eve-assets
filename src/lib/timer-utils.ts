import i18next from 'i18next'
import { LOW_FUEL_THRESHOLD_DAYS } from './structure-constants'

const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(key, options)

export const MS_PER_MINUTE = 60 * 1000
export const MS_PER_HOUR = 60 * MS_PER_MINUTE
export const MS_PER_DAY = 24 * MS_PER_HOUR

export interface FuelInfo {
  text: string
  days: number | null
  isLow: boolean
}

export function formatFuelExpiry(fuelExpires: string | undefined): FuelInfo {
  if (!fuelExpires) return { text: '-', days: null, isLow: false }

  const expiry = new Date(fuelExpires).getTime()
  const now = Date.now()
  const remaining = expiry - now

  if (remaining <= 0)
    return { text: t('common:time.empty'), days: 0, isLow: true }

  const hours = Math.floor(remaining / MS_PER_HOUR)
  const days = Math.floor(hours / 24)

  if (days >= 7)
    return { text: t('common:time.days', { count: days }), days, isLow: false }
  if (days >= 1)
    return {
      text: t('common:time.daysHours', { days, hours: hours % 24 }),
      days,
      isLow: days <= LOW_FUEL_THRESHOLD_DAYS,
    }
  return {
    text: t('common:time.hours', { count: hours }),
    days: 0,
    isLow: true,
  }
}

export function formatFuelHours(hours: number | null): FuelInfo {
  if (hours === null) return { text: '-', days: null, isLow: false }
  if (hours <= 0) return { text: t('common:time.empty'), days: 0, isLow: true }

  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)

  if (days >= 7)
    return { text: t('common:time.days', { count: days }), days, isLow: false }
  if (days >= 1)
    return {
      text: t('common:time.daysHours', { days, hours: remainingHours }),
      days,
      isLow: days <= LOW_FUEL_THRESHOLD_DAYS,
    }
  return {
    text: t('common:time.hours', { count: Math.floor(hours) }),
    days: 0,
    isLow: true,
  }
}

export function formatHoursAsTimer(hours: number | null): string {
  if (hours === null) return '-'
  if (hours <= 0) return t('common:time.empty')
  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)
  if (days >= 1)
    return t('common:time.daysHours', { days, hours: remainingHours })
  return t('common:time.hours', { count: Math.floor(hours) })
}

export function formatCountdown(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  const remaining = target - now
  if (remaining <= 0) return t('common:time.expired')
  const hours = Math.floor(remaining / MS_PER_HOUR)
  const days = Math.floor(hours / 24)
  if (days >= 1) return t('common:time.daysHours', { days, hours: hours % 24 })
  return t('common:time.hours', { count: hours })
}

export interface ExpiryInfo {
  text: string
  isExpired: boolean
}

export function formatExpiry(dateExpired: string): ExpiryInfo {
  const remaining = new Date(dateExpired).getTime() - Date.now()
  if (remaining <= 0) return { text: t('common:time.expired'), isExpired: true }
  const hours = Math.floor(remaining / MS_PER_HOUR)
  if (hours >= 24)
    return {
      text: t('common:time.days', { count: Math.floor(hours / 24) }),
      isExpired: false,
    }
  return { text: t('common:time.hours', { count: hours }), isExpired: false }
}

export function formatTimeLeft(dateExpired: string): string {
  const diff = new Date(dateExpired).getTime() - Date.now()
  if (diff <= 0) return t('common:time.expired')
  const days = Math.floor(diff / MS_PER_DAY)
  const hours = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR)
  if (days > 0) return t('common:time.daysHours', { days, hours })
  const minutes = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE)
  return t('common:time.hoursMinutes', { hours, minutes })
}

export function formatTimeRemaining(dateExpired: string): string {
  const diff = new Date(dateExpired).getTime() - Date.now()
  if (diff <= 0) return t('common:time.expired')
  const days = Math.floor(diff / MS_PER_DAY)
  const hours = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR)
  return t('common:time.fullDaysHours', { days, hours })
}

export function formatElapsed(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  const since = new Date(dateStr).getTime()
  const elapsed = Date.now() - since
  if (elapsed < 0) return null
  const days = Math.floor(elapsed / MS_PER_DAY)
  if (days >= 1) return t('common:time.days', { count: days })
  return t('common:time.lessThanOneDay')
}

export type TimerType =
  | 'reinforced'
  | 'reinforcing'
  | 'unanchoring'
  | 'onlining'
  | 'anchoring'
  | 'vulnerable'
  | 'none'

export interface TimerInfo {
  type: TimerType
  text: string
  timestamp: number | null
  isUrgent: boolean
}

function formatTimerRemaining(remaining: number): string {
  const hours = Math.floor(remaining / MS_PER_HOUR)
  const days = Math.floor(hours / 24)
  if (days >= 1) return t('common:time.daysHours', { days, hours: hours % 24 })
  return t('common:time.hours', { count: hours })
}

export function getTimerColorClass(type: TimerType, isUrgent: boolean): string {
  switch (type) {
    case 'reinforced':
    case 'reinforcing':
    case 'vulnerable':
      return isUrgent ? 'text-status-negative' : 'text-status-highlight'
    case 'unanchoring':
    case 'onlining':
    case 'anchoring':
      return 'text-status-info'
    default:
      return 'text-content-muted'
  }
}

interface StarbaseTimerInput {
  state?: string
  reinforced_until?: string
  unanchor_at?: string
}

export function getStarbaseTimer(starbase: StarbaseTimerInput): TimerInfo {
  const now = Date.now()

  if (starbase.reinforced_until) {
    const until = new Date(starbase.reinforced_until).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / MS_PER_HOUR)
      return {
        type: 'reinforced',
        text: `${t('structures:timer.reinforced')}: ${formatTimerRemaining(remaining)}`,
        timestamp: until,
        isUrgent: hours < 24,
      }
    }
  }

  if (starbase.unanchor_at) {
    const until = new Date(starbase.unanchor_at).getTime()
    const remaining = until - now
    if (remaining > 0) {
      return {
        type: 'unanchoring',
        text: `${t('structures:timer.unanchor')}: ${formatTimerRemaining(remaining)}`,
        timestamp: until,
        isUrgent: false,
      }
    }
  }

  if (starbase.state === 'onlining') {
    return {
      type: 'onlining',
      text: t('structures:timer.onlining'),
      timestamp: null,
      isUrgent: false,
    }
  }

  return { type: 'none', text: '-', timestamp: null, isUrgent: false }
}

interface StructureTimerInput {
  state: string
  state_timer_end?: string
  unanchors_at?: string
}

export function getStructureTimer(structure: StructureTimerInput): TimerInfo {
  const now = Date.now()

  if (
    structure.state_timer_end &&
    (structure.state === 'armor_reinforce' ||
      structure.state === 'hull_reinforce')
  ) {
    const until = new Date(structure.state_timer_end).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / MS_PER_HOUR)
      const label =
        structure.state === 'armor_reinforce'
          ? t('structures:timer.armor')
          : t('structures:timer.hull')
      return {
        type: 'reinforcing',
        text: `${label}: ${formatTimerRemaining(remaining)}`,
        timestamp: until,
        isUrgent: hours < 24,
      }
    }
  }

  if (structure.unanchors_at) {
    const until = new Date(structure.unanchors_at).getTime()
    const remaining = until - now
    if (remaining > 0) {
      return {
        type: 'unanchoring',
        text: `${t('structures:timer.unanchor')}: ${formatTimerRemaining(remaining)}`,
        timestamp: until,
        isUrgent: false,
      }
    }
  }

  if (structure.state === 'anchoring' && structure.state_timer_end) {
    const until = new Date(structure.state_timer_end).getTime()
    const remaining = until - now
    if (remaining > 0) {
      return {
        type: 'anchoring',
        text: `${t('structures:timer.anchor')}: ${formatTimerRemaining(remaining)}`,
        timestamp: until,
        isUrgent: false,
      }
    }
  }

  if (
    structure.state_timer_end &&
    (structure.state === 'armor_vulnerable' ||
      structure.state === 'hull_vulnerable')
  ) {
    const until = new Date(structure.state_timer_end).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / MS_PER_HOUR)
      const timeText =
        hours >= 1
          ? t('common:time.hours', { count: hours })
          : t('common:time.lessThanOneHour')
      return {
        type: 'vulnerable',
        text: `${t('structures:timer.vulnerable')}: ${timeText}`,
        timestamp: until,
        isUrgent: true,
      }
    }
  }

  return { type: 'none', text: '-', timestamp: null, isUrgent: false }
}
