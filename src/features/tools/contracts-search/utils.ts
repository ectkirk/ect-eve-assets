import type { SearchContract, CourierContract } from './types'
import type { DisplayContract } from './ContractDetailModal'
import { PLAYER_STRUCTURE_ID_THRESHOLD } from '@/lib/eve-constants'

/** Contracts priced 750%+ above market value are flagged as potential scams */
export const SCAM_THRESHOLD_PCT = 750

/** Number of contracts per search results page */
export const PAGE_SIZE = 100

/** Security status >= 0.45 rounds to 0.5 (highsec) in EVE's display */
export const HIGHSEC_THRESHOLD = 0.45

/** Security status >= 0.5 is displayed as green (highsec) */
export const HIGHSEC_DISPLAY_THRESHOLD = 0.5

export function isPlayerStructure(
  locationId: number | null | undefined
): boolean {
  return locationId != null && locationId >= PLAYER_STRUCTURE_ID_THRESHOLD
}

export function mapToCourierContract(
  c: ContractSearchContract
): CourierContract | null {
  if (
    isPlayerStructure(c.startLocationId) ||
    isPlayerStructure(c.endLocationId)
  ) {
    return null
  }
  return {
    contractId: c.contractId,
    reward: c.reward ?? 0,
    collateral: c.collateral ?? 0,
    volume: c.volume ?? 0,
    daysToComplete: c.daysToComplete ?? 0,
    originSystem: c.systemName,
    originSystemId: c.systemId,
    originRegion: c.regionName,
    originRegionId: c.regionId,
    originSecurity: c.securityStatus,
    destSystem: c.destination?.systemName ?? 'Unknown',
    destRegion: c.destination?.regionName ?? 'Unknown',
    destSecurity: c.destination?.securityStatus ?? null,
    destStructure: c.destination?.structureName,
    directJumps: c.routeInfo?.directJumps ?? 0,
    safeJumps: c.routeInfo?.safeJumps ?? null,
    dateIssued: c.dateIssued,
    dateExpired: c.dateExpired,
    title: c.title,
  }
}

export function toDisplayContract(sc: SearchContract): DisplayContract {
  const topItems = sc.topItems ?? []
  const topItemName =
    topItems.length > 1
      ? '[Multiple Items]'
      : (topItems[0]?.typeName ?? '[Empty]')

  return {
    contractId: sc.contractId,
    type: sc.type,
    title: sc.title,
    locationName: sc.systemName,
    regionName: sc.regionName,
    systemName: sc.systemName,
    systemId: sc.systemId,
    securityStatus: sc.securityStatus,
    dateIssued: sc.dateIssued,
    dateExpired: sc.dateExpired,
    price: sc.price,
    buyout: sc.buyout,
    reward: sc.reward,
    collateral: sc.collateral,
    isWantToBuy: sc.isWantToBuy,
    volume: sc.volume,
    availability: 'public',
    topItemName,
  }
}

export interface ContractDisplayValues {
  displayPrice: number | null
  displayEstValue: number | null
  diff: number | null
  pct: number | null
  diffIsGood: boolean
  hasBids: boolean
}

export function calculateContractDisplayValues(
  contract: SearchContract,
  highestBid: number | undefined
): ContractDisplayValues {
  const isWantToBuy = contract.isWantToBuy === true
  let displayPrice: number | null
  let displayEstValue: number | null
  let diff: number | null
  let pct: number | null
  let diffIsGood: boolean
  let hasBids = false

  if (isWantToBuy) {
    const reward = contract.reward ?? 0
    const itemsValue = contract.estValue
    const youGet =
      itemsValue != null ? reward + itemsValue : reward > 0 ? reward : null
    const youGive = contract.estRequestedValue ?? null
    displayPrice = youGet
    displayEstValue = youGive
    diff = youGet != null && youGive != null ? youGet - youGive : null
    pct = youGive && diff != null ? (diff / youGive) * 100 : null
    diffIsGood = diff != null && diff > 0
  } else if (contract.type === 'auction') {
    hasBids = highestBid != null
    displayPrice = highestBid ?? contract.price
    displayEstValue = contract.estValue
    diff = displayEstValue != null ? displayPrice - displayEstValue : null
    pct =
      displayEstValue && diff != null ? (diff / displayEstValue) * 100 : null
    diffIsGood = diff != null && diff < 0
  } else {
    displayPrice = contract.price
    displayEstValue = contract.estValue
    diff = displayEstValue != null ? displayPrice - displayEstValue : null
    pct =
      displayEstValue && diff != null ? (diff / displayEstValue) * 100 : null
    diffIsGood = diff != null && diff < 0
  }

  return { displayPrice, displayEstValue, diff, pct, diffIsGood, hasBids }
}

export function getSecurityColor(sec: number): string {
  if (sec >= HIGHSEC_DISPLAY_THRESHOLD) return 'text-status-positive'
  if (sec > 0) return 'text-status-warning'
  return 'text-status-negative'
}

const MS_PER_MINUTE = 1000 * 60
const MS_PER_HOUR = MS_PER_MINUTE * 60
const MS_PER_DAY = MS_PER_HOUR * 24

function formatTimeDiff(diff: number, style: 'compact' | 'verbose'): string {
  const days = Math.floor(diff / MS_PER_DAY)
  const hours = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR)

  if (style === 'verbose') {
    return `${days} days ${hours} hours`
  }

  if (days > 0) return `${days}d ${hours}h`
  const minutes = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE)
  return `${hours}h ${minutes}m`
}

export function formatTimeLeft(dateExpired: string): string {
  const diff = new Date(dateExpired).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  return formatTimeDiff(diff, 'compact')
}

export function formatTimeRemaining(dateExpired: string): string {
  const diff = new Date(dateExpired).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  return formatTimeDiff(diff, 'verbose')
}

interface BlueprintInfo {
  typeName: string
  isBlueprintCopy?: boolean | null
  materialEfficiency?: number | null
  timeEfficiency?: number | null
  runs?: number | null
}

export function formatBlueprintName(item: BlueprintInfo): string {
  const hasBlueprintData =
    item.isBlueprintCopy === true ||
    item.materialEfficiency != null ||
    item.timeEfficiency != null ||
    item.runs != null

  if (!hasBlueprintData) {
    return item.typeName
  }

  const bpType = item.isBlueprintCopy ? 'BPC' : 'BPO'
  const me = item.materialEfficiency ?? 0
  const te = item.timeEfficiency ?? 0

  if (item.isBlueprintCopy) {
    const runs = item.runs ?? 0
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

let cachedTextarea: HTMLTextAreaElement | null = null

export function decodeHtmlEntities(text: string): string {
  if (!cachedTextarea) {
    cachedTextarea = document.createElement('textarea')
  }
  cachedTextarea.innerHTML = text
  return cachedTextarea.value
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
