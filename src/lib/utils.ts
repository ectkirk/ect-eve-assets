import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18next from 'i18next'
import { getLanguage } from '@/store/settings-store'

const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(key, options)

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const LOCALE_MAP: Record<string, string> = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ru: 'ru-RU',
  zh: 'zh-CN',
}

export function getLocale(): string {
  return LOCALE_MAP[getLanguage()] ?? 'en-US'
}

export function formatNumber(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const locale = getLocale()

  if (abs >= 1_000_000_000_000) {
    return (
      sign +
      (abs / 1_000_000_000_000).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) +
      'T'
    )
  }
  if (abs >= 1_000_000_000) {
    return (
      sign +
      (abs / 1_000_000_000).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) +
      'B'
    )
  }
  if (abs >= 1_000_000) {
    return (
      sign +
      (abs / 1_000_000).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) +
      'M'
    )
  }
  if (abs >= 1_000) {
    return (
      sign +
      (abs / 1_000).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) +
      'K'
    )
  }
  return value.toLocaleString(locale)
}

export function formatFullNumber(value: number, decimals: number = 0): string {
  return value.toLocaleString(getLocale(), { maximumFractionDigits: decimals })
}

export function parseLocalizedNumber(value: string): number {
  const locale = getLocale()
  const groupSep = (1000).toLocaleString(locale).charAt(1)
  const decimalSep = (1.1).toLocaleString(locale).charAt(1)
  const cleaned = value
    .replace(new RegExp(`[${groupSep}]`, 'g'), '')
    .replace(decimalSep, '.')
  return parseFloat(cleaned)
}

export function formatDecimal(value: number, decimals: number = 1): string {
  return value.toLocaleString(getLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPrice(value: number): string {
  const locale = getLocale()
  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const decimalSeparator = (1.1).toLocaleString(locale).charAt(1)
  const trailingSuffix = decimalSeparator + '00'
  return formatted.endsWith(trailingSuffix) ? formatted.slice(0, -3) : formatted
}

export function formatPercent(value: number, decimals: number = 1): string {
  return formatDecimal(value, decimals) + '%'
}

export function roundSecurity(security: number): number {
  if (security <= 0) {
    return 0.0
  }
  if (security <= 0.05) {
    return Math.ceil(security * 10) / 10
  }
  return Math.round(security * 10) / 10
}

export function formatSecurity(value: number): string {
  return roundSecurity(value).toFixed(1)
}

export function formatVolume(
  value: number,
  options?: { decimals?: 0 | 2; suffix?: boolean }
): string {
  const { decimals = 2, suffix = false } = options ?? {}
  const formatted = value.toLocaleString(getLocale(), {
    maximumFractionDigits: decimals,
  })
  return suffix ? formatted + ' m³' : formatted
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  if (totalSeconds < 86400) {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(totalSeconds / 86400)
  const h = Math.floor((totalSeconds % 86400) / 3600)
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

export function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString(getLocale())
}

export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return t('common:time.justNow')
  if (diffMins < 60) return t('common:time.minutesAgo', { count: diffMins })
  if (diffHours < 24) return t('common:time.hoursAgo', { count: diffHours })
  if (diffDays < 7) return t('common:time.daysAgo', { count: diffDays })
  return date.toLocaleDateString(getLocale())
}

export function matchesSearchLower(
  queryLower: string,
  ...values: (string | undefined | null)[]
): boolean {
  return values.some((v) => v?.toLowerCase().includes(queryLower))
}
