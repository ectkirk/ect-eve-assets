import { formatNumber, formatDuration, getLocale } from '@/lib/utils'
import { AU_IN_METERS } from './item-detail-constants'
import type { DogmaUnit } from '../../../../shared/electron-api-types'

export interface AttributeTranslations {
  sizeSmall: string
  sizeMedium: string
  sizeLarge: string
  sizeCapital: string
  yes: string
  no: string
}

export function formatAttributeValue(
  value: number,
  unitId: number | null,
  units: Record<string, DogmaUnit> | null,
  translations?: AttributeTranslations
): string {
  const locale = getLocale()
  switch (unitId) {
    case 1:
      if (value >= AU_IN_METERS) {
        return `${(value / AU_IN_METERS).toLocaleString(locale, { maximumFractionDigits: 1 })} AU`
      }
      return `${formatNumber(value)} m`
    case 101: {
      const seconds = value / 1000
      if (seconds >= 60) return formatDuration(Math.round(seconds))
      return `${seconds.toLocaleString(locale, { maximumFractionDigits: 2 })} s`
    }
    case 105:
    case 121:
    case 205:
      return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}%`
    case 108:
    case 111:
      return `${((1 - value) * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
    case 109:
    case 124:
      return `${value >= 1 ? '+' : ''}${((value - 1) * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
    case 127:
      return `${(value * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
    case 117: {
      const sizes = translations
        ? [
            '',
            translations.sizeSmall,
            translations.sizeMedium,
            translations.sizeLarge,
            translations.sizeCapital,
          ]
        : ['', 'Small', 'Medium', 'Large', 'Capital']
      return sizes[value] ?? String(value)
    }
    case 137:
      return value ? (translations?.yes ?? 'Yes') : (translations?.no ?? 'No')
    case 139:
      return `${value >= 0 ? '+' : ''}${value.toLocaleString(locale, { maximumFractionDigits: 2 })}`
    default: {
      const displayName =
        unitId != null ? units?.[String(unitId)]?.displayName : null
      const suffix = displayName ? ` ${displayName}` : ''
      if (Number.isInteger(value)) {
        return `${formatNumber(value)}${suffix}`
      }
      return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}${suffix}`
    }
  }
}
