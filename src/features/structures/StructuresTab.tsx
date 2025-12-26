import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import {
  useStructuresStore,
  type ESICorporationStructure,
} from '@/store/structures-store'
import { useStarbasesStore, type ESIStarbase } from '@/store/starbases-store'
import { useStarbaseDetailsStore } from '@/store/starbase-details-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import {
  getType,
  getLocation,
  useReferenceCacheStore,
} from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { formatFuelExpiry } from '@/lib/timer-utils'
import { calculateStructureValues } from '@/lib/structure-constants'
import { FittingDialog } from '@/components/dialogs/FittingDialog'
import { POSInfoDialog } from '@/components/dialogs/POSInfoDialog'
import { StructureInfoDialog } from '@/components/dialogs/StructureInfoDialog'
import { StarbaseTable } from './StarbaseTable'
import { UpwellTable } from './UpwellTable'
import type { TreeNode } from '@/lib/tree-types'
import type { ESIAsset } from '@/api/endpoints/assets'
import type { StructureRow, StarbaseRow } from './types'

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
  const removeOrphanDetails = useStarbaseDetailsStore((s) => s.removeOrphans)

  const isUpdating = isUpdatingStructures || isUpdatingStarbases
  const updateError = structureError || starbaseError
  const initialized = structuresInitialized && starbasesInitialized

  const { assetsByOwner, assetNames, priceVersion } = useAssetData()

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
        if (validStates.has(state)) {
          fetchStarbaseDetail({
            corporationId: owner.id,
            starbaseId: starbase.starbase_id,
            systemId: starbase.system_id,
            characterId: owner.characterId,
          })
        }
      }
    }
  }, [starbasesByOwner, fetchStarbaseDetail])

  useEffect(() => {
    const validIds = new Set<number>()
    for (const { starbases } of starbasesByOwner) {
      for (const starbase of starbases) {
        validIds.add(starbase.starbase_id)
      }
    }
    if (validIds.size > 0) {
      removeOrphanDetails(validIds)
    }
  }, [starbasesByOwner, removeOrphanDetails])

  const types = useReferenceCacheStore((s) => s.types)
  const locations = useReferenceCacheStore((s) => s.locations)
  const structures = useReferenceCacheStore((s) => s.structures)
  const { search, setResultCount, setTotalValue } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const { structureAssetMap, structuresTotal: structureTotalValue } =
    useMemo(() => {
      void types
      void priceVersion
      return calculateStructureValues(assetsByOwner, selectedOwnerIds)
    }, [assetsByOwner, priceVersion, selectedOwnerIds, types])

  const [fittingDialogOpen, setFittingDialogOpen] = useState(false)
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)
  const [posInfoDialogOpen, setPosInfoDialogOpen] = useState(false)
  const [selectedStarbase, setSelectedStarbase] = useState<{
    starbase: ESIStarbase
    ownerName: string
  } | null>(null)
  const [structureInfoDialogOpen, setStructureInfoDialogOpen] = useState(false)
  const [selectedStructure, setSelectedStructure] = useState<{
    structure: ESICorporationStructure
    ownerName: string
  } | null>(null)

  const handleViewFitting = useCallback((node: TreeNode) => {
    setSelectedNode(node)
    setFittingDialogOpen(true)
  }, [])

  const handleViewPosInfo = useCallback(
    (starbase: ESIStarbase, ownerName: string) => {
      setSelectedStarbase({ starbase, ownerName })
      setPosInfoDialogOpen(true)
    },
    []
  )

  const handleViewStructureInfo = useCallback(
    (structure: ESICorporationStructure, ownerName: string) => {
      setSelectedStructure({ structure, ownerName })
      setStructureInfoDialogOpen(true)
    },
    []
  )

  const upwellRows = useMemo(() => {
    void locations
    void structures

    const rows: StructureRow[] = []

    const filteredStructures = structuresByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    for (const { owner, structures: ownerStructures } of filteredStructures) {
      for (const structure of ownerStructures) {
        const type = types.get(structure.type_id)
        const location = getLocation(structure.system_id)

        const assetData = structureAssetMap.get(structure.structure_id)
        const treeNode = assetData
          ? buildStructureTreeNode(
              assetData.asset,
              assetData.children,
              assetNames
            )
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
    return rows.filter(
      (row) =>
        row.structure.name?.toLowerCase().includes(searchLower) ||
        row.typeName.toLowerCase().includes(searchLower) ||
        row.owner.name.toLowerCase().includes(searchLower) ||
        row.regionName.toLowerCase().includes(searchLower)
    )
  }, [
    structuresByOwner,
    types,
    locations,
    structures,
    search,
    selectedSet,
    structureAssetMap,
    assetNames,
  ])

  const starbaseRows = useMemo(() => {
    void types
    void locations

    const rows: StarbaseRow[] = []

    const filteredStarbases = starbasesByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    for (const { owner, starbases } of filteredStarbases) {
      for (const starbase of starbases) {
        const type = types.get(starbase.type_id)
        const location = getLocation(starbase.system_id)
        const moon = starbase.moon_id
          ? getLocation(starbase.moon_id)
          : undefined

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
    return rows.filter(
      (row) =>
        row.typeName.toLowerCase().includes(searchLower) ||
        row.ownerName.toLowerCase().includes(searchLower) ||
        row.systemName.toLowerCase().includes(searchLower) ||
        row.regionName.toLowerCase().includes(searchLower) ||
        row.moonName?.toLowerCase().includes(searchLower)
    )
  }, [starbasesByOwner, types, locations, search, selectedSet])

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

  useEffect(() => {
    setTotalValue({ value: structureTotalValue })
    return () => setTotalValue(null)
  }, [structureTotalValue, setTotalValue])

  const corpOwners = useMemo(
    () => owners.filter((o) => o.type === 'corporation'),
    [owners]
  )

  const loadingState = TabLoadingState({
    dataType: 'structures',
    initialized,
    isUpdating,
    hasData: structuresByOwner.length > 0 || starbasesByOwner.length > 0,
    hasOwners: owners.length > 0,
    updateError,
    customEmptyCheck: {
      condition: corpOwners.length === 0,
      message:
        'No corporation owners. Add a corporation to view structure data.',
    },
  })
  if (loadingState) return loadingState

  const hasUpwell = upwellRows.length > 0
  const hasStarbases = starbaseRows.length > 0
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
          <UpwellTable
            rows={upwellRows}
            onViewStructureInfo={handleViewStructureInfo}
            onViewFitting={handleViewFitting}
          />
        )}

        {hasStarbases && (
          <StarbaseTable
            rows={starbaseRows}
            starbaseDetails={starbaseDetails}
            onViewPosInfo={handleViewPosInfo}
          />
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
        detail={
          selectedStarbase
            ? starbaseDetails.get(selectedStarbase.starbase.starbase_id)
            : undefined
        }
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
