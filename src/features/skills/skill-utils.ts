import { formatDecimal, formatFullNumber } from '@/lib/utils'

export function formatSP(sp: number): string {
  if (sp >= 1_000_000) {
    return `${formatDecimal(sp / 1_000_000, 1)}M`
  }
  if (sp >= 1_000) {
    return `${formatFullNumber(Math.round(sp / 1_000))}K`
  }
  return formatFullNumber(sp)
}
