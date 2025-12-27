export const THE_FORGE_REGION_ID = 10000002
export const SCAM_THRESHOLD_PCT = 750
export const PAGE_SIZE = 100

export function getSecurityColor(sec: number): string {
  if (sec >= 0.5) return 'text-status-positive'
  if (sec > 0) return 'text-status-warning'
  return 'text-status-negative'
}

export function formatTimeLeft(dateExpired: string): string {
  const now = new Date()
  const expiry = new Date(dateExpired)
  const diff = expiry.getTime() - now.getTime()

  if (diff <= 0) return 'Expired'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0) return `${days}d ${hours}h`
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m`
}

export function formatTimeRemaining(dateExpired: string): string {
  const now = new Date()
  const expiry = new Date(dateExpired)
  const diff = expiry.getTime() - now.getTime()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return `${days} days ${hours} hours`
}

interface BlueprintInfo {
  typeName: string
  isBlueprintCopy?: boolean | null
  materialEfficiency?: number | null
  timeEfficiency?: number | null
  runs?: number | null
}

export function formatBlueprintName(item: BlueprintInfo): string {
  if (item.isBlueprintCopy == null) return item.typeName
  if (!item.isBlueprintCopy && item.materialEfficiency == null) {
    return item.typeName
  }

  const bpType = item.isBlueprintCopy ? 'BPC' : 'BPO'
  const me = item.materialEfficiency ?? 0
  const te = item.timeEfficiency ?? 0
  const runs = item.runs ?? 0

  if (item.isBlueprintCopy) {
    return `${item.typeName} (${bpType}) ME${me} TE${te} ${runs}R`
  }
  return `${item.typeName} (${bpType}) ME${me} TE${te}`
}

export function getContractTypeLabel(type: string): string {
  switch (type) {
    case 'item_exchange':
      return 'Item Exchange'
    case 'auction':
      return 'Auction'
    case 'courier':
      return 'Courier'
    default:
      return type
  }
}

export function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

export function formatContractDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
