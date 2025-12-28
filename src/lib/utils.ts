import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000_000) {
    return sign + (abs / 1_000_000_000_000).toFixed(2) + 'T'
  }
  if (abs >= 1_000_000_000) {
    return sign + (abs / 1_000_000_000).toFixed(2) + 'B'
  }
  if (abs >= 1_000_000) {
    return sign + (abs / 1_000_000).toFixed(2) + 'M'
  }
  if (abs >= 1_000) {
    return sign + (abs / 1_000).toFixed(2) + 'K'
  }
  return value.toLocaleString()
}

export function formatCompactISK(value: number): string {
  return formatNumber(value) + ' ISK'
}

export function formatVolume(value: number, decimals: 0 | 2 = 0): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

export function formatFullNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
