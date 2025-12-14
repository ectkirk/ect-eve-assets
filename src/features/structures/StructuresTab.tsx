import { useEffect, useMemo, useState, useCallback } from 'react'
import { Fuel, Zap, ZapOff, AlertTriangle } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useStructuresStore, type ESICorporationStructure } from '@/store/structures-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import { useCacheVersion } from '@/hooks'
import { hasType, getType, hasLocation, getLocation } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  shield_vulnerable: { label: 'Online', color: 'text-green-400' },
  armor_vulnerable: { label: 'Armor', color: 'text-yellow-400' },
  hull_vulnerable: { label: 'Hull', color: 'text-red-400' },
  armor_reinforce: { label: 'Armor Reinforce', color: 'text-yellow-400' },
  hull_reinforce: { label: 'Hull Reinforce', color: 'text-red-400' },
  anchoring: { label: 'Anchoring', color: 'text-blue-400' },
  unanchored: { label: 'Unanchored', color: 'text-content-secondary' },
  onlining_vulnerable: { label: 'Onlining', color: 'text-blue-400' },
  online_deprecated: { label: 'Online', color: 'text-green-400' },
  anchor_vulnerable: { label: 'Anchor Vulnerable', color: 'text-yellow-400' },
  deploy_vulnerable: { label: 'Deploy Vulnerable', color: 'text-yellow-400' },
  fitting_invulnerable: { label: 'Fitting', color: 'text-blue-400' },
  unknown: { label: 'Unknown', color: 'text-content-muted' },
}

interface StructureRow {
  structure: ESICorporationStructure
  ownerName: string
  typeName: string
  systemName: string
  regionName: string
  fuelDays: number | null
  treeNode: TreeNode | null
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

function ServiceBadge({ name, state }: { name: string; state: 'online' | 'offline' | 'cleanup' }) {
  const isOnline = state === 'online'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
        isOnline ? 'bg-green-900/50 text-green-400' : 'bg-surface-secondary text-content-muted'
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
  const isUpdating = useStructuresStore((s) => s.isUpdating)
  const updateError = useStructuresStore((s) => s.updateError)
  const init = useStructuresStore((s) => s.init)
  const initialized = useStructuresStore((s) => s.initialized)

  const { assetsByOwner, assetNames } = useAssetData()

  useEffect(() => {
    init()
  }, [init])

  const cacheVersion = useCacheVersion()

  useEffect(() => {
    if (structuresByOwner.length === 0) return

    const unresolvedTypeIds = new Set<number>()
    const unknownLocationIds = new Set<number>()

    for (const { structures } of structuresByOwner) {
      for (const structure of structures) {
        const type = getType(structure.type_id)
        if (!type || type.name.startsWith('Unknown Type ')) {
          unresolvedTypeIds.add(structure.type_id)
        }
        if (!hasLocation(structure.system_id)) {
          unknownLocationIds.add(structure.system_id)
        }
      }
    }

    if (unresolvedTypeIds.size > 0) {
      resolveTypes(Array.from(unresolvedTypeIds)).catch(() => {})
    }
    if (unknownLocationIds.size > 0) {
      resolveLocations(Array.from(unknownLocationIds)).catch(() => {})
    }
  }, [structuresByOwner])

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
  const activeOwnerId = useAuthStore((s) => s.activeOwnerId)

  const structureRows = useMemo(() => {
    void cacheVersion

    const filteredByOwner = activeOwnerId === null
      ? structuresByOwner
      : structuresByOwner.filter(({ owner }) => ownerKey(owner.type, owner.id) === activeOwnerId)

    const rows: StructureRow[] = []

    for (const { owner, structures } of filteredByOwner) {
      for (const structure of structures) {
        const type = hasType(structure.type_id) ? getType(structure.type_id) : undefined
        const location = hasLocation(structure.system_id) ? getLocation(structure.system_id) : undefined

        const assetData = structureAssetMap.get(structure.structure_id)
        const treeNode = assetData
          ? buildStructureTreeNode(assetData.asset, assetData.children, assetNames)
          : null

        rows.push({
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

    let filtered = rows
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = rows.filter(
        (s) =>
          s.structure.name?.toLowerCase().includes(searchLower) ||
          s.typeName.toLowerCase().includes(searchLower) ||
          s.ownerName.toLowerCase().includes(searchLower) ||
          s.systemName.toLowerCase().includes(searchLower) ||
          s.regionName.toLowerCase().includes(searchLower)
      )
    }

    return filtered.sort((a, b) => {
      const systemCmp = a.systemName.localeCompare(b.systemName)
      if (systemCmp !== 0) return systemCmp
      return (a.structure.name ?? '').localeCompare(b.structure.name ?? '')
    })
  }, [structuresByOwner, cacheVersion, search, activeOwnerId, structureAssetMap, assetNames])

  const totalStructureCount = useMemo(() => {
    let count = 0
    for (const { structures } of structuresByOwner) {
      count += structures.length
    }
    return count
  }, [structuresByOwner])

  useEffect(() => {
    setResultCount({ showing: structureRows.length, total: totalStructureCount })
    return () => setResultCount(null)
  }, [structureRows.length, totalStructureCount, setResultCount])

  const corpOwners = useMemo(() => owners.filter((o) => o.type === 'corporation'), [owners])

  const loadingState = TabLoadingState({
    dataType: 'structures',
    initialized,
    isUpdating,
    hasData: structuresByOwner.length > 0,
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
        {structureRows.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-content-secondary">No structures.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
              <TableRow className="hover:bg-transparent">
                <TableHead>Structure</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Services</TableHead>
                <TableHead className="text-right">Fuel</TableHead>
                <TableHead className="text-right">Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {structureRows.map((row) => {
                const stateInfo = STATE_DISPLAY[row.structure.state] ?? STATE_DISPLAY.unknown!
                const fuelInfo = formatFuelExpiry(row.structure.fuel_expires)
                const isReinforced = row.structure.state.includes('reinforce')
                const hasFitting = row.treeNode !== null

                const tableRow = (
                  <TableRow key={row.structure.structure_id}>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-2">
                        <TypeIcon typeId={row.structure.type_id} />
                        <span className="truncate" title={row.structure.name}>
                          {row.structure.name || `Structure ${row.structure.structure_id}`}
                        </span>
                        {isReinforced && <AlertTriangle className="h-4 w-4 text-red-400" />}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-content-secondary">{row.typeName}</TableCell>
                    <TableCell className="py-1.5">
                      <span className="text-blue-300">{row.systemName}</span>
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
                        {fuelInfo.isLow && <Fuel className="h-4 w-4 text-red-400" />}
                        <span className={cn('tabular-nums', fuelInfo.isLow ? 'text-red-400' : 'text-content-secondary')}>
                          {fuelInfo.text}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-content-secondary">{row.ownerName}</TableCell>
                  </TableRow>
                )

                if (hasFitting) {
                  return (
                    <ContextMenu key={row.structure.structure_id}>
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
