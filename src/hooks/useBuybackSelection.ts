import { useMemo, useCallback } from 'react'
import { getSystem } from '@/store/reference-cache'
import {
  useBuybackActionStore,
  getSecurityTab,
} from '@/store/buyback-action-store'

export const SERVICE_REGIONS = new Set([
  10000054, // Aridia
  10000069, // Black Rise
  10000055, // Branch
  10000007, // Cache
  10000014, // Catch
  10000051, // Cloud Ring
  10000053, // Cobalt Edge
  10000012, // Curse
  10000035, // Deklein
  10000060, // Delve
  10000001, // Derelik
  10000005, // Detorid
  10000036, // Devoid
  10000043, // Domain
  10000039, // Esoteria
  10000064, // Essence
  10000027, // Etherium Reach
  10000037, // Everyshore
  10000046, // Fade
  10000056, // Feythabolis
  10000058, // Fountain
  10000029, // Geminate
  10000067, // Genesis
  10000011, // Great Wildlands
  10000030, // Heimatar
  10000025, // Immensea
  10000031, // Impass
  10000009, // Insmother
  10000052, // Kador
  10000049, // Khanid
  10000065, // Kor-Azor
  10000016, // Lonetrek
  10000013, // Malpais
  10000042, // Metropolis
  10000028, // Molden Heath
  10000040, // Oasa
  10000062, // Omist
  10000021, // Outer Passage
  10000057, // Outer Ring
  10000059, // Paragon Soul
  10000063, // Period Basis
  10000066, // Perrigen Falls
  10000048, // Placid
  10000047, // Providence
  10000023, // Pure Blind
  10000050, // Querious
  10000008, // Scalding Pass
  10000032, // Sinq Laison
  10000044, // Solitude
  10000022, // Stain
  10000041, // Syndicate
  10000020, // Tash-Murkon
  10000045, // Tenal
  10000061, // Tenerifis
  10000038, // The Bleak Lands
  10000033, // The Citadel
  10000002, // The Forge
  10000034, // The Kalevala Expanse
  10000018, // The Spire
  10000010, // Tribute
  10000003, // Vale of the Silent
  10000015, // Venal
  10000068, // Verge Vendor
  10000006, // Wicked Creek
])

export const BUYBACK_REGIONS = SERVICE_REGIONS

export interface BuybackItem {
  id: string
  name: string
  quantity: number
  locationId: number | undefined
  systemId: number | undefined
  regionId: number | undefined
}

interface UseBuybackSelectionOptions {
  selectedIds: Set<string>
  items: BuybackItem[]
  minItems?: number
}

export function useBuybackSelection({
  selectedIds,
  items,
  minItems = 2,
}: UseBuybackSelectionOptions) {
  const triggerBuyback = useBuybackActionStore((s) => s.triggerBuyback)

  const buybackInfo = useMemo(() => {
    if (selectedIds.size < minItems) return null

    const selectedItems = items.filter((item) => selectedIds.has(item.id))
    if (selectedItems.length < minItems) return null

    const first = selectedItems[0]
    if (!first) return null

    const firstLocation = first.locationId
    if (!firstLocation) return null

    // Structures (player-owned) have IDs >= 100M, buyback only services stations
    const isStructure = firstLocation >= 100_000_000
    if (isStructure) return null

    const allSameLocation = selectedItems.every(
      (item) => item.locationId === firstLocation
    )
    if (!allSameLocation) return null

    const regionId = first.regionId
    if (!regionId || !SERVICE_REGIONS.has(regionId)) return null

    const systemId = first.systemId
    const system = systemId ? getSystem(systemId) : undefined
    const securityTab = getSecurityTab(system?.securityStatus)

    const lines = selectedItems.map((item) => `${item.name}\t${item.quantity}`)

    return { text: lines.join('\n'), securityTab }
  }, [selectedIds, items, minItems])

  const handleSellToBuyback = useCallback(() => {
    if (buybackInfo) {
      triggerBuyback(buybackInfo)
    }
  }, [buybackInfo, triggerBuyback])

  return {
    canSellToBuyback: buybackInfo !== null,
    handleSellToBuyback,
  }
}
