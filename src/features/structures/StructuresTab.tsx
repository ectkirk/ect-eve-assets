import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { matchesSearchLower } from '@/lib/utils'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import {
  useStructuresStore,
  type ESICorporationStructure,
} from '@/store/structures-store'
import { useStarbasesStore, type ESIStarbase } from '@/store/starbases-store'
import {
  useCustomsOfficesStore,
  type ESICustomsOffice,
} from '@/store/customs-offices-store'
import {
  useStarbaseDetailsStore,
  calculateFuelHours,
} from '@/store/starbase-details-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import {
  getType,
  getTypeName,
  getLocation,
  useReferenceCacheStore,
} from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  formatFuelExpiry,
  formatFuelHours,
  getStructureTimer,
  getStarbaseTimer,
} from '@/lib/timer-utils'
import { calculateStructureValues } from '@/lib/structure-constants'
import { extractFitting } from '@/lib/fitting-utils'
import { FittingDialog } from '@/components/dialogs/FittingDialog'
import { POSInfoDialog } from '@/components/dialogs/POSInfoDialog'
import { StructureInfoDialog } from '@/components/dialogs/StructureInfoDialog'
import { POCOInfoDialog } from '@/components/dialogs/POCOInfoDialog'
import { StructuresTable } from './StructuresTable'
import type { TreeNode } from '@/lib/tree-types'
import type { ESIAsset } from '@/api/endpoints/assets'
import type { UnifiedStructureRow } from './types'

function buildStructureTreeNode(
  structureAsset: ESIAsset,
  childAssets: ESIAsset[],
  assetNames: Map<number, string>
): TreeNode {
  const type = getType(structureAsset.type_id)
  const customName = assetNames.get(structureAsset.item_id)
  const typeName = getTypeName(structureAsset.type_id)

  const children: TreeNode[] = childAssets.map((child) => {
    const childType = getType(child.type_id)
    const childName = assetNames.get(child.item_id)
    return {
      id: `asset-${child.item_id}`,
      nodeType: 'item',
      name: childName ?? getTypeName(child.type_id),
      depth: 1,
      children: [],
      asset: child,
      typeId: child.type_id,
      typeName: getTypeName(child.type_id),
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

function getRigNames(treeNode: TreeNode | null): string[] {
  if (!treeNode) return []
  const fitting = extractFitting(treeNode)
  return fitting.rigModules.filter((m) => m.type_id > 0).map((m) => m.type_name)
}

export function StructuresTab() {
  const { t } = useTranslation('structures')
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

  const customsOfficesByOwner = useCustomsOfficesStore((s) => s.dataByOwner)
  const isUpdatingCustomsOffices = useCustomsOfficesStore((s) => s.isUpdating)
  const customsOfficeError = useCustomsOfficesStore((s) => s.updateError)
  const initCustomsOffices = useCustomsOfficesStore((s) => s.init)
  const customsOfficesInitialized = useCustomsOfficesStore((s) => s.initialized)

  const starbaseDetails = useStarbaseDetailsStore((s) => s.details)
  const fetchStarbaseDetail = useStarbaseDetailsStore((s) => s.fetchDetail)
  const initStarbaseDetails = useStarbaseDetailsStore((s) => s.init)
  const removeOrphanDetails = useStarbaseDetailsStore((s) => s.removeOrphans)

  const isUpdating =
    isUpdatingStructures || isUpdatingStarbases || isUpdatingCustomsOffices
  const updateError = structureError || starbaseError || customsOfficeError
  const initialized =
    structuresInitialized && starbasesInitialized && customsOfficesInitialized

  const { assetsByOwner, assetNames, priceVersion } = useAssetData()

  useEffect(() => {
    initStructures()
    initStarbases()
    initStarbaseDetails()
    initCustomsOffices()
  }, [initStructures, initStarbases, initStarbaseDetails, initCustomsOffices])

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
  const [pocoInfoDialogOpen, setPocoInfoDialogOpen] = useState(false)
  const [selectedPoco, setSelectedPoco] = useState<{
    customsOffice: ESICustomsOffice
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

  const handleViewPocoInfo = useCallback(
    (customsOffice: ESICustomsOffice, ownerName: string) => {
      setSelectedPoco({ customsOffice, ownerName })
      setPocoInfoDialogOpen(true)
    },
    []
  )

  const unifiedRows = useMemo(() => {
    void locations
    void structures

    const rows: UnifiedStructureRow[] = []

    const filteredStructures = structuresByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    for (const { owner, structures: ownerStructures } of filteredStructures) {
      for (const structure of ownerStructures) {
        const location = getLocation(structure.system_id)
        const assetData = structureAssetMap.get(structure.structure_id)
        const treeNode = assetData
          ? buildStructureTreeNode(
              assetData.asset,
              assetData.children,
              assetNames
            )
          : null
        const fuelInfo = formatFuelExpiry(structure.fuel_expires)
        const timerInfo = getStructureTimer(structure)
        const rigs = getRigNames(treeNode)

        rows.push({
          id: `upwell-${structure.structure_id}`,
          kind: 'upwell',
          name:
            structure.name ||
            t('fallback.structure', { id: structure.structure_id }),
          owner,
          typeId: structure.type_id,
          typeName: getTypeName(structure.type_id),
          regionName: location?.regionName ?? t('fallback.unknownRegion'),
          state: structure.state,
          fuelValue: fuelInfo.days,
          fuelText: fuelInfo.text,
          fuelIsLow: fuelInfo.isLow,
          rigs,
          timerType: timerInfo.type,
          timerText: timerInfo.text,
          timerTimestamp: timerInfo.timestamp,
          timerIsUrgent: timerInfo.isUrgent,
          isReinforced: structure.state.includes('reinforce'),
          structure,
          treeNode,
        })
      }
    }

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
        const detail = starbaseDetails.get(starbase.starbase_id)
        const fuelHours = calculateFuelHours(
          detail,
          type?.towerSize,
          type?.fuelTier
        )
        const fuelInfo = formatFuelHours(fuelHours)
        const timerInfo = getStarbaseTimer(starbase)
        const state = starbase.state ?? 'unknown'
        const moonName =
          moon?.name ??
          (starbase.moon_id
            ? t('fallback.moon', { id: starbase.moon_id })
            : '-')

        rows.push({
          id: `pos-${starbase.starbase_id}`,
          kind: 'pos',
          name: moonName,
          owner,
          typeId: starbase.type_id,
          typeName: getTypeName(starbase.type_id),
          regionName: location?.regionName ?? t('fallback.unknownRegion'),
          state,
          fuelValue: fuelHours,
          fuelText: fuelInfo.text,
          fuelIsLow: fuelInfo.isLow,
          rigs: [],
          timerType: timerInfo.type,
          timerText: timerInfo.text,
          timerTimestamp: timerInfo.timestamp,
          timerIsUrgent: timerInfo.isUrgent,
          isReinforced: state === 'reinforced',
          starbase,
        })
      }
    }

    const filteredCustomsOffices = customsOfficesByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    for (const { owner, customsOffices } of filteredCustomsOffices) {
      for (const poco of customsOffices) {
        const location = getLocation(poco.system_id)
        const planet = getLocation(poco.office_id)
        const planetName =
          planet?.name ?? t('fallback.planet', { id: poco.office_id })

        rows.push({
          id: `poco-${poco.office_id}`,
          kind: 'poco',
          name: planetName,
          owner,
          typeId: 2233,
          typeName: t('poco.typeName'),
          regionName: location?.regionName ?? t('fallback.unknownRegion'),
          state: 'online',
          fuelValue: null,
          fuelText: '—',
          fuelIsLow: false,
          rigs: [],
          timerType: 'none',
          timerText: '',
          timerTimestamp: null,
          timerIsUrgent: false,
          isReinforced: false,
          customsOffice: poco,
        })
      }
    }

    if (!search) return rows

    const searchLower = search.toLowerCase()
    return rows.filter((row) =>
      matchesSearchLower(
        searchLower,
        row.name,
        row.typeName,
        row.owner.name,
        row.regionName
      )
    )
  }, [
    structuresByOwner,
    starbasesByOwner,
    customsOfficesByOwner,
    types,
    locations,
    structures,
    search,
    selectedSet,
    structureAssetMap,
    assetNames,
    starbaseDetails,
    t,
  ])

  const totalCount = useMemo(() => {
    let count = 0
    for (const { structures } of structuresByOwner) {
      count += structures.length
    }
    for (const { starbases } of starbasesByOwner) {
      count += starbases.length
    }
    for (const { customsOffices } of customsOfficesByOwner) {
      count += customsOffices.length
    }
    return count
  }, [structuresByOwner, starbasesByOwner, customsOfficesByOwner])

  useEffect(() => {
    setResultCount({ showing: unifiedRows.length, total: totalCount })
    return () => setResultCount(null)
  }, [unifiedRows.length, totalCount, setResultCount])

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
    hasData:
      structuresByOwner.length > 0 ||
      starbasesByOwner.length > 0 ||
      customsOfficesByOwner.length > 0,
    hasOwners: owners.length > 0,
    updateError,
    customEmptyCheck: {
      condition: corpOwners.length === 0,
      message: t('noCorpOwners'),
    },
  })
  if (loadingState) return loadingState

  return (
    <>
      <StructuresTable
        rows={unifiedRows}
        onViewStructureInfo={handleViewStructureInfo}
        onViewPosInfo={handleViewPosInfo}
        onViewPocoInfo={handleViewPocoInfo}
        onViewFitting={handleViewFitting}
      />
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
      <POCOInfoDialog
        open={pocoInfoDialogOpen}
        onOpenChange={setPocoInfoDialogOpen}
        customsOffice={selectedPoco?.customsOffice ?? null}
        ownerName={selectedPoco?.ownerName ?? ''}
      />
    </>
  )
}
