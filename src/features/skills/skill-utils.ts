export function formatSP(sp: number): string {
  if (sp >= 1_000_000) {
    return `${(sp / 1_000_000).toFixed(1)}M`
  }
  if (sp >= 1_000) {
    return `${(sp / 1_000).toFixed(0)}K`
  }
  return String(sp)
}
