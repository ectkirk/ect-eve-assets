import { useEffect, useMemo, useState, useCallback } from 'react'
import { Fuel, AlertTriangle, Clock } from 'lucide-react'
import { useAuthStore, ownerKey, type Owner } from '@/store/auth-store'
import { useStructuresStore, type ESICorporationStructure } from '@/store/structures-store'
import { useStarbasesStore, type ESIStarbase } from '@/store/starbases-store'
import { useStarbaseDetailsStore, calculateFuelHours } from '@/store/starbase-details-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import { useCacheVersion, useSortable, SortableHeader } from '@/hooks'
import { hasType, getType, hasLocation, getLocation } from '@/store/reference-cache'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type UpwellSortColumn = 'name' | 'type' | 'region' | 'state' | 'fuel' | 'details'
type StarbaseSortColumn = 'name' | 'type' | 'region' | 'state' | 'fuel' | 'details'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { TypeIcon } from '@/components/ui/type-icon'
import { FittingDialog } from '@/components/dialogs/FittingDialog'
import { POSInfoDialog } from '@/components/dialogs/POSInfoDialog'
import { StructureInfoDialog } from '@/components/dialogs/StructureInfoDialog'
import type { TreeNode } from '@/lib/tree-types'
import type { ESIAsset } from '@/api/endpoints/assets'

const STATE_DISPLAY: Record<string, { label: string; color: string }> = {
  // Upwell structure states
  shield_vulnerable: { label: 'Online', color: 'text-status-positive' },
  armor_vulnerable: { label: 'Armor', color: 'text-status-highlight' },
  hull_vulnerable: { label: 'Hull', color: 'text-status-negative' },
  armor_reinforce: { label: 'Armor Reinforce', color: 'text-status-highlight' },
  hull_reinforce: { label: 'Hull Reinforce', color: 'text-status-negative' },
  anchoring: { label: 'Anchoring', color: 'text-status-info' },
  unanchored: { label: 'Unanchored', color: 'text-content-secondary' },
  onlining_vulnerable: { label: 'Onlining', color: 'text-status-info' },
  online_deprecated: { label: 'Online', color: 'text-status-positive' },
  anchor_vulnerable: { label: 'Anchor Vulnerable', color: 'text-status-highlight' },
  deploy_vulnerable: { label: 'Deploy Vulnerable', color: 'text-status-highlight' },
  fitting_invulnerable: { label: 'Fitting', color: 'text-status-info' },
  // POS states
  offline: { label: 'Offline', color: 'text-content-secondary' },
  online: { label: 'Online', color: 'text-status-positive' },
  onlining: { label: 'Onlining', color: 'text-status-info' },
  reinforced: { label: 'Reinforced', color: 'text-status-negative' },
  unanchoring: { label: 'Unanchoring', color: 'text-status-highlight' },
  unknown: { label: 'Unknown', color: 'text-content-muted' },
}

interface StructureRow {
  kind: 'upwell'
  structure: ESICorporationStructure
  owner: Owner
  typeName: string
  regionName: string
  fuelDays: number | null
  treeNode: TreeNode | null
}

interface StarbaseRow {
  kind: 'pos'
  starbase: ESIStarbase
  owner: Owner
  ownerName: string
  typeName: string
  systemName: string
  regionName: string
  moonName: string | null
  towerSize: number | undefined
  fuelTier: number | undefined
}


function formatFuelExpiry(fuelExpires: string | undefined): { text: string; days: number | null; isLow: boolean } {
  if (!fuelExpires) return { text: '-', days: null, isLow: false }

  const expiry = new Date(fuelExpires).getTime()
  const now = Date.now()
  const remaining = expiry - now

  if (remaining <= 0) return { text: 'Empty', days: 0, isLow: true }

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const days = Math.floor(hours / 24)

  if (days >= 7) return { text: `${days}d`, days, isLow: false }
  if (days >= 1) return { text: `${days}d ${hours % 24}h`, days, isLow: days <= 3 }
  return { text: `${hours}h`, days: 0, isLow: true }
}

function formatFuelHours(hours: number | null): { text: string; days: number | null; isLow: boolean } {
  if (hours === null) return { text: '-', days: null, isLow: false }
  if (hours <= 0) return { text: 'Empty', days: 0, isLow: true }

  const days = Math.floor(hours / 24)
  const remainingHours = Math.floor(hours % 24)

  if (days >= 7) return { text: `${days}d`, days, isLow: false }
  if (days >= 1) return { text: `${days}d ${remainingHours}h`, days, isLow: days <= 3 }
  return { text: `${Math.floor(hours)}h`, days: 0, isLow: true }
}

type TimerInfo = {
  type: 'reinforced' | 'unanchoring' | 'onlining' | 'none'
  text: string
  timestamp: number | null
  isUrgent: boolean
}

function getStarbaseTimer(starbase: ESIStarbase): TimerInfo {
  const now = Date.now()

  if (starbase.reinforced_until) {
    const until = new Date(starbase.reinforced_until).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const days = Math.floor(hours / 24)
      const text = days >= 1 ? `${days}d ${hours % 24}h` : `${hours}h`
      return { type: 'reinforced', text: `RF: ${text}`, timestamp: until, isUrgent: hours < 24 }
    }
  }

  if (starbase.unanchor_at) {
    const until = new Date(starbase.unanchor_at).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const days = Math.floor(hours / 24)
      const text = days >= 1 ? `${days}d ${hours % 24}h` : `${hours}h`
      return { type: 'unanchoring', text: `Unanchor: ${text}`, timestamp: until, isUrgent: false }
    }
  }

  if (starbase.state === 'onlining') {
    return { type: 'onlining', text: 'Onlining', timestamp: null, isUrgent: false }
  }

  return { type: 'none', text: '-', timestamp: null, isUrgent: false }
}

type StructureTimerInfo = {
  type: 'reinforcing' | 'unanchoring' | 'anchoring' | 'vulnerable' | 'none'
  text: string
  timestamp: number | null
  isUrgent: boolean
}

function getStructureTimer(structure: ESICorporationStructure): StructureTimerInfo {
  const now = Date.now()

  if (structure.state_timer_end && (
    structure.state === 'armor_reinforce' ||
    structure.state === 'hull_reinforce'
  )) {
    const until = new Date(structure.state_timer_end).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const days = Math.floor(hours / 24)
      const text = days >= 1 ? `${days}d ${hours % 24}h` : `${hours}h`
      const label = structure.state === 'armor_reinforce' ? 'Armor' : 'Hull'
      return { type: 'reinforcing', text: `${label}: ${text}`, timestamp: until, isUrgent: hours < 24 }
    }
  }

  if (structure.unanchors_at) {
    const until = new Date(structure.unanchors_at).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const days = Math.floor(hours / 24)
      const text = days >= 1 ? `${days}d ${hours % 24}h` : `${hours}h`
      return { type: 'unanchoring', text: `Unanchor: ${text}`, timestamp: until, isUrgent: false }
    }
  }

  if (structure.state === 'anchoring' && structure.state_timer_end) {
    const until = new Date(structure.state_timer_end).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const days = Math.floor(hours / 24)
      const text = days >= 1 ? `${days}d ${hours % 24}h` : `${hours}h`
      return { type: 'anchoring', text: `Anchor: ${text}`, timestamp: until, isUrgent: false }
    }
  }

  if (structure.state_timer_end && (
    structure.state === 'armor_vulnerable' ||
    structure.state === 'hull_vulnerable'
  )) {
    const until = new Date(structure.state_timer_end).getTime()
    const remaining = until - now
    if (remaining > 0) {
      const hours = Math.floor(remaining / (60 * 60 * 1000))
      const text = hours >= 1 ? `${hours}h` : '<1h'
      return { type: 'vulnerable', text: `Vuln: ${text}`, timestamp: until, isUrgent: true }
    }
  }

  return { type: 'none', text: '-', timestamp: null, isUrgent: false }
}

function buildStructureTreeNode(
  structureAsset: ESIAsset,
  childAssets: ESIAsset[],
  assetNames: Map<number, string>
): TreeNode {
  const type = getType(structureAsset.type_id)
  const customName = assetNames.get(structureAsset.item_id)
  const typeName = type?.name ?? `Unknown Type ${structureAsset.type_id}`

  const children: TreeNode[] = childAssets.map((child) => {
    const childType = getType(child.type_id)
    const childName = assetNames.get(child.item_id)
    return {
      id: `asset-${child.item_id}`,
      nodeType: 'item',
      name: childName ?? childType?.name ?? `Unknown Type ${child.type_id}`,
      depth: 1,
      children: [],
      asset: child,
      typeId: child.type_id,
      typeName: childType?.name ?? `Unknown Type ${child.type_id}`,
      categoryId: childType?.categoryId,
      categoryName: childType?.categoryName,
      groupName: childType?.groupName,
      quantity: child.quantity,
      totalCount: child.quantity,
      totalValue: 0,
      totalVolume: 0,
    }
  })

  return {
    id: `asset-${structureAsset.item_id}`,
    nodeType: 'ship',
    name: customName ? `${typeName} (${customName})` : typeName,
    depth: 0,
    children,
    asset: structureAsset,
    typeId: structureAsset.type_id,
    typeName,
    categoryId: type?.categoryId,
    categoryName: type?.categoryName,
    groupName: type?.groupName,
    quantity: 1,
    totalCount: 1,
    totalValue: 0,
    totalVolume: 0,
  }
}

const STRUCTURE_CATEGORY_ID = 65

export function StructuresTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const structuresByOwner = useStructuresStore((s) => s.dataByOwner)
  const isUpdatingStructures = useStructuresStore((s) => s.isUpdating)
  const structureError = useStructuresStore((s) => s.updateError)
  const initStructures = useStructuresStore((s) => s.init)
  const structuresInitialized = useStructuresStore((s) => s.initialized)

  const starbasesByOwner = useStarbasesStore((s) => s.dataByOwner)
  const isUpdatingStarbases = useStarbasesStore((s) => s.isUpdating)
  const starbaseError = useStarbasesStore((s) => s.updateError)
  const initStarbases = useStarbasesStore((s) => s.init)
  const starbasesInitialized = useStarbasesStore((s) => s.initialized)

  const starbaseDetails = useStarbaseDetailsStore((s) => s.details)
  const fetchStarbaseDetail = useStarbaseDetailsStore((s) => s.fetchDetail)
  const initStarbaseDetails = useStarbaseDetailsStore((s) => s.init)

  const isUpdating = isUpdatingStructures || isUpdatingStarbases
  const updateError = structureError || starbaseError
  const initialized = structuresInitialized && starbasesInitialized

  const { assetsByOwner, assetNames } = useAssetData()

  useEffect(() => {
    initStructures()
    initStarbases()
    initStarbaseDetails()
  }, [initStructures, initStarbases, initStarbaseDetails])

  useEffect(() => {
    const validStates = new Set(['online', 'onlining', 'reinforced'])
    for (const { owner, starbases } of starbasesByOwner) {
      for (const starbase of starbases) {
        const state = starbase.state ?? 'unknown'
        if (validStates.has(state) && !starbaseDetails.has(starbase.starbase_id)) {
          fetchStarbaseDetail({
            corporationId: owner.id,
            starbaseId: starbase.starbase_id,
            systemId: starbase.system_id,
            characterId: owner.characterId,
          })
        }
      }
    }
  }, [starbasesByOwner, starbaseDetails, fetchStarbaseDetail])

  useEffect(() => {
    const typeIds = new Set<number>()
    const locationIds = new Set<number>()

    for (const { starbases } of starbasesByOwner) {
      for (const starbase of starbases) {
        typeIds.add(starbase.type_id)
        locationIds.add(starbase.system_id)
        if (starbase.moon_id) locationIds.add(starbase.moon_id)
      }
    }

    if (typeIds.size > 0) resolveTypes(Array.from(typeIds))
    if (locationIds.size > 0) resolveLocations(Array.from(locationIds))
  }, [starbasesByOwner])

  const cacheVersion = useCacheVersion()

  const structureAssetMap = useMemo(() => {
    void cacheVersion
    const map = new Map<number, { asset: ESIAsset; children: ESIAsset[] }>()

    for (const { assets } of assetsByOwner) {
      for (const asset of assets) {
        const type = getType(asset.type_id)
        if (type?.categoryId === STRUCTURE_CATEGORY_ID && asset.location_type === 'solar_system') {
          const children = assets.filter((a) => a.location_id === asset.item_id)
          map.set(asset.item_id, { asset, children })
        }
      }
    }

    return map
  }, [assetsByOwner, cacheVersion])

  const [fittingDialogOpen, setFittingDialogOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)
  const [posInfoDialogOpen, setPosInfoDialogOpen] = useState(false)
  const [selectedStarbase, setSelectedStarbase] = useState<{ starbase: ESIStarbase; ownerName: string } | null>(null)
  const [structureInfoDialogOpen, setStructureInfoDialogOpen] = useState(false)
  const [selectedStructure, setSelectedStructure] = useState<{ structure: ESICorporationStructure; ownerName: string } | null>(null)

  const handleViewFitting = useCallback((node: TreeNode) => {
    setSelectedNode(node)
    setFittingDialogOpen(true)
  }, [])

  const handleViewPosInfo = useCallback((starbase: ESIStarbase, ownerName: string) => {
    setSelectedStarbase({ starbase, ownerName })
    setPosInfoDialogOpen(true)
  }, [])

  const handleViewStructureInfo = useCallback((structure: ESICorporationStructure, ownerName: string) => {
    setSelectedStructure({ structure, ownerName })
    setStructureInfoDialogOpen(true)
  }, [])

  const { search, setResultCount } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const upwellRows = useMemo(() => {
    void cacheVersion

    const rows: StructureRow[] = []

    const filteredStructures = structuresByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    for (const { owner, structures } of filteredStructures) {
      for (const structure of structures) {
        const type = hasType(structure.type_id) ? getType(structure.type_id) : undefined
        const location = hasLocation(structure.system_id) ? getLocation(structure.system_id) : undefined

        const assetData = structureAssetMap.get(structure.structure_id)
        const treeNode = assetData
          ? buildStructureTreeNode(assetData.asset, assetData.children, assetNames)
          : null

        rows.push({
          kind: 'upwell',
          structure,
          owner,
          typeName: type?.name ?? `Unknown Type ${structure.type_id}`,
          regionName: location?.regionName ?? 'Unknown Region',
          fuelDays: formatFuelExpiry(structure.fuel_expires).days,
          treeNode,
        })
      }
    }

    if (!search) return rows

    const searchLower = search.toLowerCase()
    return rows.filter((row) =>
      row.structure.name?.toLowerCase().includes(searchLower) ||
      row.typeName.toLowerCase().includes(searchLower) ||
      row.owner.name.toLowerCase().includes(searchLower) ||
      row.regionName.toLowerCase().includes(searchLower)
    )
  }, [structuresByOwner, cacheVersion, search, selectedSet, structureAssetMap, assetNames])

  const starbaseRows = useMemo(() => {
    void cacheVersion

    const rows: StarbaseRow[] = []

    const filteredStarbases = starbasesByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    for (const { owner, starbases } of filteredStarbases) {
      for (const starbase of starbases) {
        const type = hasType(starbase.type_id) ? getType(starbase.type_id) : undefined
        const location = hasLocation(starbase.system_id) ? getLocation(starbase.system_id) : undefined
        const moon = starbase.moon_id && hasLocation(starbase.moon_id) ? getLocation(starbase.moon_id) : undefined

        rows.push({
          kind: 'pos',
          starbase,
          owner,
          ownerName: owner.name,
          typeName: type?.name ?? `Unknown Type ${starbase.type_id}`,
          systemName: location?.name ?? `System ${starbase.system_id}`,
          regionName: location?.regionName ?? 'Unknown Region',
          moonName: moon?.name ?? null,
          towerSize: type?.towerSize,
          fuelTier: type?.fuelTier,
        })
      }
    }

    if (!search) return rows

    const searchLower = search.toLowerCase()
    return rows.filter((row) =>
      row.typeName.toLowerCase().includes(searchLower) ||
      row.ownerName.toLowerCase().includes(searchLower) ||
      row.systemName.toLowerCase().includes(searchLower) ||
      row.regionName.toLowerCase().includes(searchLower) ||
      row.moonName?.toLowerCase().includes(searchLower)
    )
  }, [starbasesByOwner, cacheVersion, search, selectedSet])

  const upwellSort = useSortable<UpwellSortColumn>('region', 'asc')
  const starbaseSort = useSortable<StarbaseSortColumn>('region', 'asc')

  const sortedUpwellRows = useMemo(() => {
    const getValue = (row: StructureRow, column: UpwellSortColumn): number | string => {
      switch (column) {
        case 'name':
          return (row.structure.name ?? '').toLowerCase()
        case 'type':
          return row.typeName.toLowerCase()
        case 'region':
          return row.regionName.toLowerCase()
        case 'state':
          return row.structure.state
        case 'fuel':
          return row.fuelDays ?? -1
        case 'details': {
          const timer = getStructureTimer(row.structure)
          if (timer.type === 'reinforcing') return timer.timestamp ?? Infinity
          if (timer.type === 'vulnerable') return (timer.timestamp ?? Infinity) + 1e14
          if (timer.type === 'unanchoring') return (timer.timestamp ?? Infinity) + 1e15
          if (timer.type === 'anchoring') return (timer.timestamp ?? Infinity) + 1e16
          return Infinity
        }
        default:
          return 0
      }
    }

    const getName = (row: StructureRow) =>
      (row.structure.name ?? '').toLowerCase()

    return [...upwellRows].sort((a, b) => {
      const aVal = getValue(a, upwellSort.sortColumn)
      const bVal = getValue(b, upwellSort.sortColumn)
      const dir = upwellSort.sortDirection === 'asc' ? 1 : -1

      if (aVal < bVal) return -dir
      if (aVal > bVal) return dir

      const aName = getName(a)
      const bName = getName(b)
      if (aName < bName) return -1
      if (aName > bName) return 1
      return 0
    })
  }, [upwellRows, upwellSort.sortColumn, upwellSort.sortDirection])

  const sortedStarbaseRows = useMemo(() => {
    const getValue = (row: StarbaseRow, column: StarbaseSortColumn): number | string => {
      switch (column) {
        case 'name':
          return (row.moonName ?? `Moon ${row.starbase.moon_id ?? 0}`).toLowerCase()
        case 'type':
          return row.typeName.toLowerCase()
        case 'region':
          return row.regionName.toLowerCase()
        case 'state':
          return row.starbase.state ?? 'unknown'
        case 'fuel': {
          const detail = starbaseDetails.get(row.starbase.starbase_id)
          const hours = calculateFuelHours(detail, row.towerSize, row.fuelTier)
          return hours ?? -1
        }
        case 'details': {
          const timer = getStarbaseTimer(row.starbase)
          if (timer.type === 'reinforced') return timer.timestamp ?? Infinity
          if (timer.type === 'unanchoring') return (timer.timestamp ?? Infinity) + 1e15
          if (timer.type === 'onlining') return 1e16
          return Infinity
        }
        default:
          return 0
      }
    }

    const getMoonName = (row: StarbaseRow) =>
      (row.moonName ?? `Moon ${row.starbase.moon_id ?? 0}`).toLowerCase()

    return [...starbaseRows].sort((a, b) => {
      const aVal = getValue(a, starbaseSort.sortColumn)
      const bVal = getValue(b, starbaseSort.sortColumn)
      const dir = starbaseSort.sortDirection === 'asc' ? 1 : -1

      if (aVal < bVal) return -dir
      if (aVal > bVal) return dir

      const aMoon = getMoonName(a)
      const bMoon = getMoonName(b)
      if (aMoon < bMoon) return -1
      if (aMoon > bMoon) return 1
      return 0
    })
  }, [starbaseRows, starbaseSort.sortColumn, starbaseSort.sortDirection, starbaseDetails])

  const totalCount = useMemo(() => {
    let count = 0
    for (const { structures } of structuresByOwner) {
      count += structures.length
    }
    for (const { starbases } of starbasesByOwner) {
      count += starbases.length
    }
    return count
  }, [structuresByOwner, starbasesByOwner])

  const showingCount = upwellRows.length + starbaseRows.length

  useEffect(() => {
    setResultCount({ showing: showingCount, total: totalCount })
    return () => setResultCount(null)
  }, [showingCount, totalCount, setResultCount])

  const corpOwners = useMemo(() => owners.filter((o) => o.type === 'corporation'), [owners])

  const loadingState = TabLoadingState({
    dataType: 'structures',
    initialized,
    isUpdating,
    hasData: structuresByOwner.length > 0 || starbasesByOwner.length > 0,
    hasOwners: owners.length > 0,
    updateError,
    customEmptyCheck: {
      condition: corpOwners.length === 0,
      message: 'No corporation owners. Add a corporation to view structure data.',
    },
  })
  if (loadingState) return loadingState

  const hasUpwell = sortedUpwellRows.length > 0
  const hasStarbases = sortedStarbaseRows.length > 0
  const hasAny = hasUpwell || hasStarbases

  return (
    <>
      <div className="h-full overflow-auto flex flex-col gap-4">
        {!hasAny && (
          <div className="flex items-center justify-center h-full">
            <p className="text-content-secondary">No structures.</p>
          </div>
        )}

        {hasUpwell && (
          <div className="rounded-lg border border-border bg-surface-secondary/30 overflow-hidden flex-shrink-0">
            <div className="px-3 py-2 border-b border-border bg-surface-secondary/50">
              <h3 className="text-sm font-medium text-content-primary">Upwell Structures ({sortedUpwellRows.length})</h3>
            </div>
            <Table className="table-fixed">
              <TableHeader className="bg-surface-secondary">
                <TableRow className="hover:bg-transparent">
                  <SortableHeader column="name" label="Structure" sortColumn={upwellSort.sortColumn} sortDirection={upwellSort.sortDirection} onSort={upwellSort.handleSort} className="w-[35%]" />
                  <SortableHeader column="type" label="Type" sortColumn={upwellSort.sortColumn} sortDirection={upwellSort.sortDirection} onSort={upwellSort.handleSort} className="w-[20%]" />
                  <SortableHeader column="region" label="Region" sortColumn={upwellSort.sortColumn} sortDirection={upwellSort.sortDirection} onSort={upwellSort.handleSort} className="w-[15%]" />
                  <SortableHeader column="state" label="State" sortColumn={upwellSort.sortColumn} sortDirection={upwellSort.sortDirection} onSort={upwellSort.handleSort} className="w-[10%]" />
                  <SortableHeader column="fuel" label="Fuel" sortColumn={upwellSort.sortColumn} sortDirection={upwellSort.sortDirection} onSort={upwellSort.handleSort} className="w-[10%] text-right" />
                  <SortableHeader column="details" label="Details" sortColumn={upwellSort.sortColumn} sortDirection={upwellSort.sortDirection} onSort={upwellSort.handleSort} className="w-[10%] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUpwellRows.map((row) => {
                  const stateInfo = STATE_DISPLAY[row.structure.state] ?? STATE_DISPLAY.unknown!
                  const fuelInfo = formatFuelExpiry(row.structure.fuel_expires)
                  const isReinforced = row.structure.state.includes('reinforce')
                  const hasFitting = row.treeNode !== null
                  const timerInfo = getStructureTimer(row.structure)

                  const timerColorClass = timerInfo.type === 'reinforcing' || timerInfo.type === 'vulnerable'
                    ? (timerInfo.isUrgent ? 'text-status-negative' : 'text-status-highlight')
                    : timerInfo.type === 'unanchoring' || timerInfo.type === 'anchoring'
                      ? 'text-status-info'
                      : 'text-content-muted'

                  const tableRow = (
                    <TableRow key={`upwell-${row.structure.structure_id}`}>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <img
                            src={`https://images.evetech.net/corporations/${row.owner.id}/logo?size=32`}
                            alt=""
                            className="w-5 h-5 rounded"
                          />
                          <span className="truncate" title={row.structure.name}>
                            {row.structure.name || `Structure ${row.structure.structure_id}`}
                          </span>
                          {isReinforced && <AlertTriangle className="h-4 w-4 text-status-negative" />}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <TypeIcon typeId={row.structure.type_id} />
                          <span className="text-content-secondary">{row.typeName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-content-secondary">{row.regionName}</TableCell>
                      <TableCell className="py-1.5">
                        <span className={stateInfo.color}>{stateInfo.label}</span>
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {fuelInfo.isLow && <Fuel className="h-4 w-4 text-status-negative" />}
                          <span className={cn('tabular-nums', fuelInfo.isLow ? 'text-status-negative' : 'text-content-secondary')}>
                            {fuelInfo.text}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {timerInfo.type !== 'none' && <Clock className="h-3.5 w-3.5" />}
                          <span className={cn('tabular-nums text-sm', timerColorClass)}>
                            {timerInfo.text}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )

                  return (
                    <ContextMenu key={`upwell-${row.structure.structure_id}`}>
                      <ContextMenuTrigger asChild>{tableRow}</ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => handleViewStructureInfo(row.structure, row.owner.name)}>
                          Show Structure Info
                        </ContextMenuItem>
                        {hasFitting && (
                          <ContextMenuItem onClick={() => handleViewFitting(row.treeNode!)}>
                            View Fitting
                          </ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {hasStarbases && (
          <div className="rounded-lg border border-border bg-surface-secondary/30 overflow-hidden flex-shrink-0">
            <div className="px-3 py-2 border-b border-border bg-surface-secondary/50">
              <h3 className="text-sm font-medium text-content-primary">Starbases ({sortedStarbaseRows.length})</h3>
            </div>
            <Table className="table-fixed">
              <TableHeader className="bg-surface-secondary">
                <TableRow className="hover:bg-transparent">
                  <SortableHeader column="name" label="Moon" sortColumn={starbaseSort.sortColumn} sortDirection={starbaseSort.sortDirection} onSort={starbaseSort.handleSort} className="w-[35%]" />
                  <SortableHeader column="type" label="Type" sortColumn={starbaseSort.sortColumn} sortDirection={starbaseSort.sortDirection} onSort={starbaseSort.handleSort} className="w-[20%]" />
                  <SortableHeader column="region" label="Region" sortColumn={starbaseSort.sortColumn} sortDirection={starbaseSort.sortDirection} onSort={starbaseSort.handleSort} className="w-[15%]" />
                  <SortableHeader column="state" label="State" sortColumn={starbaseSort.sortColumn} sortDirection={starbaseSort.sortDirection} onSort={starbaseSort.handleSort} className="w-[10%]" />
                  <SortableHeader column="fuel" label="Fuel" sortColumn={starbaseSort.sortColumn} sortDirection={starbaseSort.sortDirection} onSort={starbaseSort.handleSort} className="w-[10%] text-right" />
                  <SortableHeader column="details" label="Details" sortColumn={starbaseSort.sortColumn} sortDirection={starbaseSort.sortDirection} onSort={starbaseSort.handleSort} className="w-[10%] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStarbaseRows.map((row) => {
                  const state = row.starbase.state ?? 'unknown'
                  const stateInfo = STATE_DISPLAY[state] ?? STATE_DISPLAY.unknown!
                  const isReinforced = state === 'reinforced'
                  const detail = starbaseDetails.get(row.starbase.starbase_id)
                  const fuelHours = calculateFuelHours(detail, row.towerSize, row.fuelTier)
                  const fuelInfo = formatFuelHours(fuelHours)
                  const timerInfo = getStarbaseTimer(row.starbase)

                  const moonDisplay = row.moonName
                    ?? (row.starbase.moon_id ? `Moon ${row.starbase.moon_id}` : '-')

                  const timerColorClass = timerInfo.type === 'reinforced'
                    ? (timerInfo.isUrgent ? 'text-status-negative' : 'text-status-highlight')
                    : timerInfo.type === 'unanchoring' || timerInfo.type === 'onlining'
                      ? 'text-status-info'
                      : 'text-content-muted'

                  const tableRow = (
                    <TableRow key={`pos-${row.starbase.starbase_id}`}>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <img
                            src={`https://images.evetech.net/corporations/${row.owner.id}/logo?size=32`}
                            alt=""
                            className="w-5 h-5 rounded"
                          />
                          <span className="truncate" title={moonDisplay}>
                            {moonDisplay}
                          </span>
                          {isReinforced && <AlertTriangle className="h-4 w-4 text-status-negative" />}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <TypeIcon typeId={row.starbase.type_id} />
                          <span className="text-content-secondary">{row.typeName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-content-secondary">{row.regionName}</TableCell>
                      <TableCell className="py-1.5">
                        <span className={stateInfo.color}>{stateInfo.label}</span>
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {fuelInfo.isLow && <Fuel className="h-4 w-4 text-status-negative" />}
                          <span className={cn('tabular-nums', fuelInfo.isLow ? 'text-status-negative' : 'text-content-secondary')}>
                            {fuelInfo.text}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {timerInfo.type !== 'none' && <Clock className="h-3.5 w-3.5" />}
                          <span className={cn('tabular-nums text-sm', timerColorClass)}>
                            {timerInfo.text}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )

                  return (
                    <ContextMenu key={`pos-${row.starbase.starbase_id}`}>
                      <ContextMenuTrigger asChild>{tableRow}</ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => handleViewPosInfo(row.starbase, row.ownerName)}>
                          Show POS Info
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <FittingDialog
        open={fittingDialogOpen}
        onOpenChange={setFittingDialogOpen}
        shipNode={selectedNode}
      />
      <POSInfoDialog
        open={posInfoDialogOpen}
        onOpenChange={setPosInfoDialogOpen}
        starbase={selectedStarbase?.starbase ?? null}
        detail={selectedStarbase ? starbaseDetails.get(selectedStarbase.starbase.starbase_id) : undefined}
        ownerName={selectedStarbase?.ownerName ?? ''}
      />
      <StructureInfoDialog
        open={structureInfoDialogOpen}
        onOpenChange={setStructureInfoDialogOpen}
        structure={selectedStructure?.structure ?? null}
        ownerName={selectedStructure?.ownerName ?? ''}
      />
    </>
  )
}
