import type { SearchContract, CourierContract, ContractTopItem } from './types'
import type { DisplayContract } from './ContractDetailModal'
import { PLAYER_STRUCTURE_ID_THRESHOLD } from '@/lib/eve-constants'
import { formatTimeLeft, formatTimeRemaining } from '@/lib/timer-utils'
import { formatDateTime, getLocale } from '@/lib/utils'
import {
  getTypeName,
  getSystem,
  getRegion,
  getStation,
  getStationsBySystemId,
} from '@/store/reference-cache'

export { formatTimeLeft, formatTimeRemaining, formatDateTime }

// =============================================================================
// Localization Helpers
// =============================================================================

export function localizeTypeName(typeId: number | undefined, fallback: string): string {
  if (!typeId) return fallback
  return getTypeName(typeId) ?? fallback
}

export function localizeSystemName(systemId: number, fallback: string): string {
  return getSystem(systemId)?.name ?? fallback
}

export function localizeRegionName(regionId: number, fallback: string): string {
  return getRegion(regionId)?.name ?? fallback
}

export function localizeRegionFromSystem(systemId: number, fallback: string): string {
  const system = getSystem(systemId)
  if (!system) return fallback
  return getRegion(system.regionId)?.name ?? fallback
}

function localizeStationById(stationId: number | null | undefined): string | undefined {
  if (stationId == null || isPlayerStructure(stationId)) return undefined
  return getStation(stationId)?.name
}

function localizeStationBySystem(systemId: number | null | undefined): string | undefined {
  if (systemId == null) return undefined
  const stations = getStationsBySystemId(systemId)
  return stations.length === 1 ? stations[0]?.name : undefined
}

function localizeStation(
  locationId: number | null | undefined,
  systemId: number | null | undefined,
  fallback?: string
): string | undefined {
  return localizeStationById(locationId) ?? localizeStationBySystem(systemId) ?? fallback
}

// =============================================================================
// Contract Item Helpers
// =============================================================================

export function getItemTypeName(item: ContractTopItem): string {
  return localizeTypeName(item.typeId, item.typeName)
}

interface BlueprintInfo {
  typeId?: number
  typeName: string
  isBlueprintCopy?: boolean | null
  materialEfficiency?: number | null
  timeEfficiency?: number | null
  runs?: number | null
}

export function formatBlueprintName(item: BlueprintInfo): string {
  const name = localizeTypeName(item.typeId, item.typeName)
  const hasBlueprintData =
    item.isBlueprintCopy === true ||
    item.materialEfficiency != null ||
    item.timeEfficiency != null ||
    item.runs != null

  if (!hasBlueprintData) return name

  const bpType = item.isBlueprintCopy ? 'BPC' : 'BPO'
  const me = item.materialEfficiency ?? 0
  const te = item.timeEfficiency ?? 0

  if (item.isBlueprintCopy) {
    return `${name} (${bpType}) ME${me} TE${te} ${item.runs ?? 0}R`
  }
  return `${name} (${bpType}) ME${me} TE${te}`
}

// =============================================================================
// Constants
// =============================================================================

export const SCAM_THRESHOLD_PCT = 750
export const PAGE_SIZE = 100
export const HIGHSEC_THRESHOLD = 0.45
export const HIGHSEC_DISPLAY_THRESHOLD = 0.5

// =============================================================================
// Location Helpers
// =============================================================================

export function isPlayerStructure(locationId: number | null | undefined): boolean {
  return locationId != null && locationId >= PLAYER_STRUCTURE_ID_THRESHOLD
}

const SEC_TEXT_CLASSES: Record<number, string> = {
  10: 'text-sec-10',
  9: 'text-sec-9',
  8: 'text-sec-8',
  7: 'text-sec-7',
  6: 'text-sec-6',
  5: 'text-sec-5',
  4: 'text-sec-4',
  3: 'text-sec-3',
  2: 'text-sec-2',
  1: 'text-sec-1',
  0: 'text-sec-0',
}

export function getSecurityColor(sec: number): string {
  const rounded = Math.round(Math.max(0, Math.min(1, sec)) * 10)
  return SEC_TEXT_CLASSES[rounded] ?? SEC_TEXT_CLASSES[0]!
}

// =============================================================================
// Contract Mappers
// =============================================================================

export function mapToCourierContract(
  c: ContractSearchContract
): CourierContract | null {
  if (isPlayerStructure(c.startLocationId) || isPlayerStructure(c.endLocationId)) {
    return null
  }

  const destSystemId = c.destination?.systemId ?? null

  return {
    contractId: c.contractId,
    reward: c.reward ?? 0,
    collateral: c.collateral ?? 0,
    volume: c.volume ?? 0,
    daysToComplete: c.daysToComplete ?? 0,
    originSystem: localizeSystemName(c.systemId, c.systemName),
    originSystemId: c.systemId,
    originRegion: localizeRegionName(c.regionId, c.regionName),
    originRegionId: c.regionId,
    originSecurity: c.securityStatus,
    originStation: localizeStation(c.startLocationId, c.systemId),
    destSystem: destSystemId
      ? localizeSystemName(destSystemId, c.destination?.systemName ?? '')
      : (c.destination?.systemName ?? 'Unknown'),
    destSystemId,
    destRegion: destSystemId
      ? localizeRegionFromSystem(destSystemId, c.destination?.regionName ?? 'Unknown')
      : (c.destination?.regionName ?? 'Unknown'),
    destSecurity: c.destination?.securityStatus ?? null,
    destStation: localizeStation(
      c.endLocationId,
      c.destination?.systemId,
      c.destination?.structureName
    ),
    directJumps: c.routeInfo?.directJumps ?? 0,
    safeJumps: c.routeInfo?.safeJumps ?? null,
    dateIssued: c.dateIssued,
    dateExpired: c.dateExpired,
    title: c.title,
  }
}

export function toDisplayContract(sc: SearchContract): DisplayContract {
  const topItems = sc.topItems ?? []
  const systemName = localizeSystemName(sc.systemId, sc.systemName)
  const regionName = localizeRegionName(sc.regionId, sc.regionName)

  return {
    contractId: sc.contractId,
    type: sc.type,
    title: sc.title,
    locationName: systemName,
    regionName,
    regionId: sc.regionId,
    systemName,
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
    topItemName:
      topItems.length > 1
        ? '[Multiple Items]'
        : topItems[0]
          ? getItemTypeName(topItems[0])
          : '[Empty]',
  }
}

// =============================================================================
// Contract Display Calculations
// =============================================================================

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

  if (isWantToBuy) {
    const reward = contract.reward ?? 0
    const itemsValue = contract.estValue
    const youGet = itemsValue != null ? reward + itemsValue : reward > 0 ? reward : null
    const youGive = contract.estRequestedValue ?? null
    const diff = youGet != null && youGive != null ? youGet - youGive : null
    const pct = youGive && diff != null ? (diff / youGive) * 100 : null
    return {
      displayPrice: youGet,
      displayEstValue: youGive,
      diff,
      pct,
      diffIsGood: diff != null && diff > 0,
      hasBids: false,
    }
  }

  if (contract.type === 'auction') {
    const hasBids = highestBid != null
    const displayPrice = highestBid ?? contract.price
    const displayEstValue = contract.estValue
    const diff = displayEstValue != null ? displayPrice - displayEstValue : null
    const pct = displayEstValue && diff != null ? (diff / displayEstValue) * 100 : null
    return {
      displayPrice,
      displayEstValue,
      diff,
      pct,
      diffIsGood: diff != null && diff < 0,
      hasBids,
    }
  }

  const displayPrice = contract.price
  const displayEstValue = contract.estValue
  const diff = displayEstValue != null ? displayPrice - displayEstValue : null
  const pct = displayEstValue && diff != null ? (diff / displayEstValue) * 100 : null
  return {
    displayPrice,
    displayEstValue,
    diff,
    pct,
    diffIsGood: diff != null && diff < 0,
    hasBids: false,
  }
}

// =============================================================================
// Date Formatting
// =============================================================================

export function formatContractDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(getLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export { getContractTypeName as getContractTypeLabel } from '@/features/contracts/contracts-utils'
