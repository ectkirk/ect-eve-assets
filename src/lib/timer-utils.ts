import { LOW_FUEL_THRESHOLD_DAYS } from './structure-constants'

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

  if (remaining <= 0) return { text: 'Empty', days: 0, isLow: true }

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const days = Math.floor(hours / 24)

  if (days >= 7) return { text: `${days}d`, days, isLow: false }
  if (days >= 1)
    return {
      text: `${days}d ${hours % 24}h`,
      days,
      isLow: days <= LOW_FUEL_THRESHOLD_DAYS,
    }
  return { text: `${hours}h`, days: 0, isLow: true }
}

export function formatFuelHours(hours: number | null): FuelInfo {
  if (hours === null) return { text: '-', days: null, isLow: false }
  if (hours <= 0) return { text: 'Empty', days: 0, isLow: true }

  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)

  if (days >= 7) return { text: `${days}d`, days, isLow: false }
  if (days >= 1)
    return {
      text: `${days}d ${remainingHours}h`,
      days,
      isLow: days <= LOW_FUEL_THRESHOLD_DAYS,
    }
  return { text: `${Math.floor(hours)}h`, days: 0, isLow: true }
}

export function formatHoursAsTimer(hours: number | null): string {
  if (hours === null) return '-'
  if (hours <= 0) return 'Empty'
  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)
  if (days >= 1) return `${days}d ${remainingHours}h`
  return `${Math.floor(hours)}h`
}

export function formatCountdown(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  const remaining = target - now
  if (remaining <= 0) return 'Expired'
  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days}d ${hours % 24}h`
  return `${hours}h`
}

export function formatElapsed(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  const since = new Date(dateStr).getTime()
  const elapsed = Date.now() - since
  if (elapsed < 0) return null
  const days = Math.floor(elapsed / (24 * 60 * 60 * 1000))
  if (days >= 1) return `${days}d`
  return '<1d'
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
  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days}d ${hours % 24}h`
  return `${hours}h`
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
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      return {
        type: 'reinforced',
        text: `RF: ${formatTimerRemaining(remaining)}`,
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
        text: `Unanchor: ${formatTimerRemaining(remaining)}`,
        timestamp: until,
        isUrgent: false,
      }
    }
  }

  if (starbase.state === 'onlining') {
    return {
      type: 'onlining',
      text: 'Onlining',
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
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const label = structure.state === 'armor_reinforce' ? 'Armor' : 'Hull'
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
        text: `Unanchor: ${formatTimerRemaining(remaining)}`,
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
        text: `Anchor: ${formatTimerRemaining(remaining)}`,
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
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const text = hours >= 1 ? `${hours}h` : '<1h'
      return {
        type: 'vulnerable',
        text: `Vuln: ${text}`,
        timestamp: until,
        isUrgent: true,
      }
    }
  }

  return { type: 'none', text: '-', timestamp: null, isUrgent: false }
}
