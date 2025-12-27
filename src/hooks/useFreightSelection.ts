import { useMemo, useCallback } from 'react'
import { getSystem } from '@/store/reference-cache'
import { useFreightActionStore } from '@/store/freight-action-store'
import { SERVICE_REGIONS } from './useBuybackSelection'

export interface FreightItem {
  id: string
  name: string
  quantity: number
  locationId: number | undefined
  systemId: number | undefined
  regionId: number | undefined
}

interface UseFreightSelectionOptions {
  selectedIds: Set<string>
  items: FreightItem[]
  minItems?: number
}

export function useFreightSelection({
  selectedIds,
  items,
  minItems = 2,
}: UseFreightSelectionOptions) {
  const triggerFreight = useFreightActionStore((s) => s.triggerFreight)

  const freightInfo = useMemo(() => {
    if (selectedIds.size < minItems) return null

    const selectedItems = items.filter((item) => selectedIds.has(item.id))
    if (selectedItems.length < minItems) return null

    const first = selectedItems[0]
    if (!first) return null

    const firstLocation = first.locationId
    if (!firstLocation) return null

    // Structures (player-owned) have IDs >= 100M, freight only services stations
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
    const securityStatus = system?.securityStatus
    const nullSec =
      securityStatus !== undefined &&
      securityStatus !== null &&
      securityStatus <= 0.0

    const lines = selectedItems.map((item) => `${item.name}\t${item.quantity}`)

    return { text: lines.join('\n'), nullSec }
  }, [selectedIds, items, minItems])

  const handleShipFreight = useCallback(() => {
    if (freightInfo) {
      triggerFreight(freightInfo)
    }
  }, [freightInfo, triggerFreight])

  return {
    canShipFreight: freightInfo !== null,
    handleShipFreight,
  }
}
