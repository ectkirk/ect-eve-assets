import { useEffect, useMemo, useState, useCallback } from 'react'
import { Fuel, Zap, ZapOff, AlertTriangle } from 'lucide-react'
import { useAuthStore, ownerKey, type Owner } from '@/store/auth-store'
import { useStructuresStore, type ESICorporationStructure } from '@/store/structures-store'
import { useStarbasesStore, type ESIStarbase } from '@/store/starbases-store'
import { useStarbaseDetailsStore, calculateFuelHours, calculateStrontHours } from '@/store/starbase-details-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import { useCacheVersion, useSortable, SortableHeader, sortRows } from '@/hooks'
import { hasType, getType, hasLocation, getLocation } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type StructureSortColumn = 'name' | 'type' | 'location' | 'state' | 'fuel' | 'owner'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { TypeIcon } from '@/components/ui/type-icon'
import { FittingDialog } from '@/components/dialogs/FittingDialog'
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
  ownerName: string
  typeName: string
  systemName: string
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

type AnyStructureRow = StructureRow | StarbaseRow

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

function ServiceBadge({ name, state }: { name: string; state: 'online' | 'offline' | 'cleanup' }) {
  const isOnline = state === 'online'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
        isOnline ? 'bg-semantic-success/20 text-status-positive' : 'bg-surface-secondary text-content-muted'
      )}
    >
      {isOnline ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
      {name}
    </span>
  )
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

  const isUpdating = isUpdatingStructures || isUpdatingStarbases
  const updateError = structureError || starbaseError
  const initialized = structuresInitialized && starbasesInitialized

  const { assetsByOwner, assetNames } = useAssetData()

  useEffect(() => {
    initStructures()
    initStarbases()
  }, [initStructures, initStarbases])

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

  const handleViewFitting = useCallback((node: TreeNode) => {
    setSelectedNode(node)
    setFittingDialogOpen(true)
  }, [])

  const { search, setResultCount } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const allRows = useMemo(() => {
    void cacheVersion

    const rows: AnyStructureRow[] = []

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
          ownerName: owner.name,
          typeName: type?.name ?? `Unknown Type ${structure.type_id}`,
          systemName: location?.name ?? `System ${structure.system_id}`,
          regionName: location?.regionName ?? 'Unknown Region',
          fuelDays: formatFuelExpiry(structure.fuel_expires).days,
          treeNode,
        })
      }
    }

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
    return rows.filter((row) => {
      if (row.kind === 'upwell') {
        return (
          row.structure.name?.toLowerCase().includes(searchLower) ||
          row.typeName.toLowerCase().includes(searchLower) ||
          row.ownerName.toLowerCase().includes(searchLower) ||
          row.systemName.toLowerCase().includes(searchLower) ||
          row.regionName.toLowerCase().includes(searchLower)
        )
      }
      return (
        row.typeName.toLowerCase().includes(searchLower) ||
        row.ownerName.toLowerCase().includes(searchLower) ||
        row.systemName.toLowerCase().includes(searchLower) ||
        row.regionName.toLowerCase().includes(searchLower) ||
        row.moonName?.toLowerCase().includes(searchLower)
      )
    })
  }, [structuresByOwner, starbasesByOwner, cacheVersion, search, selectedSet, structureAssetMap, assetNames])

  const { sortColumn, sortDirection, handleSort } = useSortable<StructureSortColumn>('location', 'asc')

  const sortedRows = useMemo(() => {
    return sortRows(allRows, sortColumn, sortDirection, (row, column) => {
      switch (column) {
        case 'name':
          if (row.kind === 'upwell') return (row.structure.name ?? '').toLowerCase()
          return (row.moonName ?? row.typeName).toLowerCase()
        case 'type':
          return row.typeName.toLowerCase()
        case 'location':
          return `${row.regionName} ${row.systemName}`.toLowerCase()
        case 'state':
          if (row.kind === 'upwell') return row.structure.state
          return row.starbase.state ?? 'unknown'
        case 'fuel': {
          if (row.kind === 'upwell') return row.fuelDays ?? -1
          const detail = starbaseDetails.get(row.starbase.starbase_id)
          const hours = row.starbase.state === 'reinforced'
            ? calculateStrontHours(detail, row.towerSize)
            : calculateFuelHours(detail, row.towerSize, row.fuelTier)
          return hours !== null ? hours / 24 : -1
        }
        case 'owner':
          return row.ownerName.toLowerCase()
        default:
          return 0
      }
    })
  }, [allRows, sortColumn, sortDirection, starbaseDetails])

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

  useEffect(() => {
    setResultCount({ showing: allRows.length, total: totalCount })
    return () => setResultCount(null)
  }, [allRows.length, totalCount, setResultCount])

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

  return (
    <>
      <div className="h-full rounded-lg border border-border bg-surface-secondary/30 overflow-auto">
        {allRows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-content-secondary">No structures.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
              <TableRow className="hover:bg-transparent">
                <SortableHeader column="name" label="Structure" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader column="type" label="Type" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader column="location" label="Location" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                <SortableHeader column="state" label="State" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
                <th>Services</th>
                <SortableHeader column="fuel" label="Fuel" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
                <SortableHeader column="owner" label="Owner" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => {
                if (row.kind === 'pos') {
                  const state = row.starbase.state ?? 'unknown'
                  const stateInfo = STATE_DISPLAY[state] ?? STATE_DISPLAY.unknown!
                  const isReinforced = state === 'reinforced'
                  const displayName = row.moonName ?? row.typeName
                  const detail = starbaseDetails.get(row.starbase.starbase_id)
                  const fuelHours = calculateFuelHours(detail, row.towerSize, row.fuelTier)
                  const strontHours = calculateStrontHours(detail, row.towerSize)
                  const fuelInfo = isReinforced
                    ? formatFuelHours(strontHours)
                    : formatFuelHours(fuelHours)

                  return (
                    <TableRow key={`pos-${row.starbase.starbase_id}`}>
                      <TableCell className="py-1.5">
                        <div className="flex items-center gap-2">
                          <TypeIcon typeId={row.starbase.type_id} />
                          <span className="truncate" title={displayName}>
                            {displayName}
                          </span>
                          {isReinforced && <AlertTriangle className="h-4 w-4 text-status-negative" />}
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-content-secondary">{row.typeName}</TableCell>
                      <TableCell className="py-1.5">
                        <span className="text-status-info">{row.systemName}</span>
                        <span className="text-content-muted text-xs ml-1">({row.regionName})</span>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <span className={stateInfo.color}>{stateInfo.label}</span>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <span className="text-content-muted">-</span>
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {fuelInfo.isLow && <Fuel className="h-4 w-4 text-status-negative" />}
                          <span className={cn('tabular-nums', fuelInfo.isLow ? 'text-status-negative' : 'text-content-secondary')}>
                            {fuelInfo.text}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-content-secondary">{row.ownerName}</TableCell>
                    </TableRow>
                  )
                }

                const stateInfo = STATE_DISPLAY[row.structure.state] ?? STATE_DISPLAY.unknown!
                const fuelInfo = formatFuelExpiry(row.structure.fuel_expires)
                const isReinforced = row.structure.state.includes('reinforce')
                const hasFitting = row.treeNode !== null

                const tableRow = (
                  <TableRow key={`upwell-${row.structure.structure_id}`}>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <TypeIcon typeId={row.structure.type_id} />
                        <span className="truncate" title={row.structure.name}>
                          {row.structure.name || `Structure ${row.structure.structure_id}`}
                        </span>
                        {isReinforced && <AlertTriangle className="h-4 w-4 text-status-negative" />}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-content-secondary">{row.typeName}</TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-status-info">{row.systemName}</span>
                      <span className="text-content-muted text-xs ml-1">({row.regionName})</span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className={stateInfo.color}>{stateInfo.label}</span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {row.structure.services?.map((service, idx) => (
                          <ServiceBadge key={idx} name={service.name} state={service.state} />
                        )) ?? <span className="text-content-muted">-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {fuelInfo.isLow && <Fuel className="h-4 w-4 text-status-negative" />}
                        <span className={cn('tabular-nums', fuelInfo.isLow ? 'text-status-negative' : 'text-content-secondary')}>
                          {fuelInfo.text}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-content-secondary">{row.ownerName}</TableCell>
                  </TableRow>
                )

                if (hasFitting) {
                  return (
                    <ContextMenu key={`upwell-${row.structure.structure_id}`}>
                      <ContextMenuTrigger asChild>{tableRow}</ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => handleViewFitting(row.treeNode!)}>
                          View Fitting
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                }

                return tableRow
              })}
            </TableBody>
          </Table>
        )}
      </div>
      <FittingDialog
        open={fittingDialogOpen}
        onOpenChange={setFittingDialogOpen}
        shipNode={selectedNode}
      />
    </>
  )
}
