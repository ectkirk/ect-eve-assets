import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { matchesSearchLower } from '@/lib/utils'
import { useTabControls } from '@/context'
import { useColumnSettings, type ColumnConfig } from '@/hooks'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import {
  useContractsStore,
  buildOwnerContracts,
  type OwnerContracts,
} from '@/store/contracts-store'
import { useAssetData } from '@/hooks/useAssetData'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { usePriceStore } from '@/store/price-store'
import { ContractsTable } from './ContractsTable'
import { type ContractRow, buildContractRow } from './contracts-utils'

const CONTAINER_CLASS =
  'h-full rounded-lg border border-border bg-surface-secondary/30'

const CONTRACT_COLUMNS: ColumnConfig[] = [
  { id: 'owner', label: 'columns.owner' },
  { id: 'type', label: 'columns.type' },
  { id: 'items', label: 'columns.items' },
  { id: 'location', label: 'columns.location' },
  { id: 'assigner', label: 'columns.assigner' },
  { id: 'assignee', label: 'columns.assignee' },
  { id: 'price', label: 'columns.price' },
  { id: 'value', label: 'columns.value' },
  { id: 'volume', label: 'columns.volume' },
  { id: 'collateral', label: 'columns.collateral' },
  { id: 'days', label: 'columns.days' },
  { id: 'expires', label: 'columns.expires' },
  { id: 'status', label: 'columns.status' },
]

export function ContractsTab() {
  const { t } = useTranslation('contracts')
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const priceVersion = usePriceStore((s) => s.priceVersion)
  const contractsUpdating = useContractsStore((s) => s.isUpdating)
  const updateError = useContractsStore((s) => s.updateError)
  const init = useContractsStore((s) => s.init)
  const initialized = useContractsStore((s) => s.initialized)
  const itemsById = useContractsStore((s) => s.itemsById)
  const itemsByContractId = useContractsStore((s) => s.itemsByContractId)
  const bidsByContractId = useContractsStore((s) => s.bidsByContractId)
  const visibilityByOwner = useContractsStore((s) => s.visibilityByOwner)

  const contractsByOwner = useMemo<OwnerContracts[]>(
    () =>
      buildOwnerContracts(
        visibilityByOwner,
        itemsById,
        itemsByContractId,
        bidsByContractId
      ),
    [visibilityByOwner, itemsById, itemsByContractId, bidsByContractId]
  )

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || contractsUpdating

  useEffect(() => {
    init()
  }, [init])

  const types = useReferenceCacheStore((s) => s.types)
  const structures = useReferenceCacheStore((s) => s.structures)
  const names = useReferenceCacheStore((s) => s.names)

  const { search, setTotalValue, setColumns, setContractAvailabilityFilter } =
    useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const [hideAlliance, setHideAlliance] = useState(() => {
    try {
      return localStorage.getItem('contracts.hideAlliance') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('contracts.hideAlliance', String(hideAlliance))
    } catch {
      /* storage unavailable */
    }
  }, [hideAlliance])

  const { getColumnsForDropdown, getVisibleColumns } = useColumnSettings(
    'contracts',
    CONTRACT_COLUMNS
  )
  const visibleColumns = useMemo(
    () => new Set(getVisibleColumns()),
    [getVisibleColumns]
  )

  const {
    filteredContracts,
    totalItemValue,
    totalContractPrice,
    totalCollateral,
  } = useMemo(() => {
    void types
    void structures
    void names
    void priceVersion

    const filteredContractsByOwner = contractsByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    const ownerCharIds = new Set<number>()
    const ownerCorpIds = new Set<number>()
    const ownerAllianceIds = new Set<number>()
    for (const owner of owners) {
      ownerCharIds.add(owner.characterId)
      if (owner.corporationId) {
        ownerCorpIds.add(owner.corporationId)
      }
      if (owner.allianceId) {
        ownerAllianceIds.add(owner.allianceId)
      }
    }

    const allContracts: ContractRow[] = []
    const seenContracts = new Set<number>()

    for (const { owner, contracts } of filteredContractsByOwner) {
      for (const contractWithItems of contracts) {
        const contract = contractWithItems.contract

        if (seenContracts.has(contract.contract_id)) continue
        seenContracts.add(contract.contract_id)

        const isActive =
          contract.status === 'outstanding' || contract.status === 'in_progress'
        if (!isActive) continue

        if (hideAlliance && ownerAllianceIds.has(contract.assignee_id)) continue

        const isIssuer =
          ownerCharIds.has(contract.issuer_id) ||
          ownerCorpIds.has(contract.issuer_corporation_id)

        const row = buildContractRow(
          contractWithItems,
          owner.type,
          owner.id,
          isIssuer,
          t
        )
        allContracts.push(row)
      }
    }

    const searchLower = search.toLowerCase()
    let itemValue = 0
    let contractPrice = 0
    let collateral = 0

    const filtered = allContracts.filter((row) => {
      if (
        search &&
        !matchesSearchLower(
          searchLower,
          row.typeName,
          row.assignerName,
          row.locationName,
          row.assigneeName
        )
      )
        return false
      itemValue += row.itemValue
      const contract = row.contractWithItems.contract
      contractPrice += contract.price ?? 0
      if (contract.type === 'courier') {
        collateral += contract.collateral ?? 0
      }
      return true
    })

    return {
      filteredContracts: filtered,
      totalItemValue: itemValue,
      totalContractPrice: contractPrice,
      totalCollateral: collateral,
    }
  }, [
    contractsByOwner,
    types,
    structures,
    names,
    owners,
    priceVersion,
    search,
    selectedSet,
    hideAlliance,
    t,
  ])

  useEffect(() => {
    setTotalValue({
      value: totalItemValue,
      label: t('totals.itemValue'),
      secondaryValue: totalContractPrice,
      secondaryLabel: t('totals.contractPrice'),
      tertiaryValue: totalCollateral > 0 ? totalCollateral : undefined,
      tertiaryLabel: t('totals.collateral'),
    })
    return () => setTotalValue(null)
  }, [totalItemValue, totalContractPrice, totalCollateral, setTotalValue, t])

  useEffect(() => {
    setColumns(getColumnsForDropdown())
    return () => setColumns([])
  }, [getColumnsForDropdown, setColumns])

  const hasCorporationOwnerWithAlliance = useMemo(
    () =>
      owners.some((owner) => owner.type === 'corporation' && owner.allianceId),
    [owners]
  )

  useEffect(() => {
    if (hasCorporationOwnerWithAlliance) {
      setContractAvailabilityFilter({
        hideAlliance,
        onToggleAlliance: setHideAlliance,
      })
    } else {
      setContractAvailabilityFilter(null)
    }
    return () => setContractAvailabilityFilter(null)
  }, [
    hasCorporationOwnerWithAlliance,
    hideAlliance,
    setContractAvailabilityFilter,
  ])

  const loadingState = TabLoadingState({
    dataType: 'contracts',
    initialized,
    isUpdating,
    hasData: contractsByOwner.length > 0,
    hasOwners: owners.length > 0,
    updateError,
  })
  if (loadingState) return loadingState

  if (filteredContracts.length === 0) {
    return (
      <div className={`${CONTAINER_CLASS} flex items-center justify-center`}>
        <p className="text-content-secondary">{t('empty')}</p>
      </div>
    )
  }

  return (
    <div className={`${CONTAINER_CLASS} overflow-auto`}>
      <ContractsTable
        contracts={filteredContracts}
        visibleColumns={visibleColumns}
      />
    </div>
  )
}
