import { useEffect, useMemo } from 'react'
import { useTabControls } from '@/context'
import { useColumnSettings, type ColumnConfig } from '@/hooks'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { useAuthStore, ownerKey, findOwnerByKey } from '@/store/auth-store'
import {
  useContractsStore,
  type OwnerContracts,
  type ContractWithItems,
} from '@/store/contracts-store'
import { useAssetData } from '@/hooks/useAssetData'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { usePriceStore } from '@/store/price-store'
import { ContractsTable } from './ContractsTable'
import { type ContractRow, buildContractRow } from './contracts-utils'

const CONTAINER_CLASS =
  'h-full rounded-lg border border-border bg-surface-secondary/30'

const CONTRACT_COLUMNS: ColumnConfig[] = [
  { id: 'owner', label: 'Owner' },
  { id: 'type', label: 'Type' },
  { id: 'items', label: 'Items' },
  { id: 'location', label: 'Location' },
  { id: 'assigner', label: 'Assigner' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'price', label: 'Price' },
  { id: 'value', label: 'Value' },
  { id: 'volume', label: 'Volume' },
  { id: 'collateral', label: 'Collateral' },
  { id: 'days', label: 'Days' },
  { id: 'expires', label: 'Expires' },
  { id: 'status', label: 'Status' },
]

export function ContractsTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const priceVersion = usePriceStore((s) => s.priceVersion)
  const contractsUpdating = useContractsStore((s) => s.isUpdating)
  const updateError = useContractsStore((s) => s.updateError)
  const init = useContractsStore((s) => s.init)
  const initialized = useContractsStore((s) => s.initialized)
  const itemsById = useContractsStore((s) => s.itemsById)
  const itemsByContractId = useContractsStore((s) => s.itemsByContractId)
  const visibilityByOwner = useContractsStore((s) => s.visibilityByOwner)

  const contractsByOwner = useMemo<OwnerContracts[]>(() => {
    const result: OwnerContracts[] = []
    for (const [ownerKey, contractIds] of visibilityByOwner) {
      const owner = findOwnerByKey(ownerKey)
      if (!owner) continue
      const contracts: ContractWithItems[] = []
      for (const contractId of contractIds) {
        const stored = itemsById.get(contractId)
        if (stored) {
          contracts.push({
            contract: stored.item,
            items: itemsByContractId.get(contractId),
          })
        }
      }
      result.push({ owner, contracts })
    }
    return result
  }, [visibilityByOwner, itemsById, itemsByContractId])

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || contractsUpdating

  useEffect(() => {
    init()
  }, [init])

  const types = useReferenceCacheStore((s) => s.types)
  const structures = useReferenceCacheStore((s) => s.structures)
  const names = useReferenceCacheStore((s) => s.names)

  const { search, setTotalValue, setColumns } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

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
    for (const owner of owners) {
      ownerCharIds.add(owner.characterId)
      if (owner.corporationId) {
        ownerCorpIds.add(owner.corporationId)
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

        const isIssuer =
          ownerCharIds.has(contract.issuer_id) ||
          ownerCorpIds.has(contract.issuer_corporation_id)

        const row = buildContractRow(
          contractWithItems,
          owner.type,
          owner.id,
          isIssuer
        )
        allContracts.push(row)
      }
    }

    const searchLower = search.toLowerCase()
    let itemValue = 0
    let contractPrice = 0
    let collateral = 0

    const filtered = allContracts.filter((row) => {
      if (search) {
        const matches =
          row.typeName.toLowerCase().includes(searchLower) ||
          row.assignerName.toLowerCase().includes(searchLower) ||
          row.locationName.toLowerCase().includes(searchLower) ||
          row.assigneeName.toLowerCase().includes(searchLower)
        if (!matches) return false
      }
      itemValue += row.itemValue
      const contract = row.contractWithItems.contract
      contractPrice += (contract.price ?? 0) + (contract.reward ?? 0)
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
  ])

  useEffect(() => {
    setTotalValue({
      value: totalItemValue,
      label: 'Item Value',
      secondaryValue: totalContractPrice,
      secondaryLabel: 'Contract Price',
      tertiaryValue: totalCollateral > 0 ? totalCollateral : undefined,
      tertiaryLabel: 'Collateral',
    })
    return () => setTotalValue(null)
  }, [totalItemValue, totalContractPrice, totalCollateral, setTotalValue])

  useEffect(() => {
    setColumns(getColumnsForDropdown())
    return () => setColumns([])
  }, [getColumnsForDropdown, setColumns])

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
        <p className="text-content-secondary">No active contracts.</p>
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
