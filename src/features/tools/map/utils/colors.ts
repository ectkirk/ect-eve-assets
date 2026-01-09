import { roundSecurity } from '@/lib/utils'

export { roundSecurity }

const FACTION_COLORS: Record<number, string> = {
  500001: 'hsl(210, 100%, 50%)',
  500002: 'hsl(0, 100%, 50%)',
  500003: 'hsl(45, 100%, 50%)',
  500004: 'hsl(120, 60%, 45%)',
}

export function getSecurityColor(security: number): string {
  const rounded = roundSecurity(security)
  if (rounded >= 0.5) {
    const intensity = (rounded - 0.5) / 0.5
    const hue = 60 + intensity * 180
    const lightness = 50 - intensity * 20
    return `hsl(${hue}, 100%, ${lightness}%)`
  } else if (rounded > 0) {
    const intensity = (rounded - 0.1) / 0.3
    const saturation = 60 + intensity * 40
    const lightness = 30 + intensity * 20
    return `hsl(30, ${saturation}%, ${lightness}%)`
  }
  return `hsl(0, 100%, 40%)`
}

export function getRegionColor(regionId: number): string {
  const hue = (regionId * 137.508) % 360
  return `hsl(${hue}, 70%, 60%)`
}

export function getFactionColor(factionId: number | undefined): string {
  if (!factionId) return 'hsl(0, 0%, 30%)'
  return (
    FACTION_COLORS[factionId] ?? `hsl(${(factionId * 137.508) % 360}, 70%, 60%)`
  )
}

export function getAllianceColor(allianceId: number | undefined): string {
  if (!allianceId) return 'hsl(0, 0%, 30%)'
  const hue = (allianceId * 137.508) % 360
  return `hsl(${hue}, 70%, 60%)`
}

export interface HSL {
  h: number
  s: number
  l: number
}

export function parseHSL(color: string): HSL | null {
  const match = color.match(/hsl\(([\d.]+),\s*(\d+)%,\s*(\d+)%\)/)
  if (!match || match.length < 4) return null
  return {
    h: parseFloat(match[1]!),
    s: parseInt(match[2]!, 10),
    l: parseInt(match[3]!, 10),
  }
}

export function hslToString(hsl: HSL, opacity = 1): string {
  if (opacity === 1) {
    return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`
  }
  return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${opacity})`
}
