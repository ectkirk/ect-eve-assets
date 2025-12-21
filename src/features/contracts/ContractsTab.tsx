import { useEffect, useMemo, useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, Truck } from 'lucide-react'
import { useTabControls } from '@/context'
import { useColumnSettings, useCacheVersion, type ColumnConfig } from '@/hooks'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useContractsStore } from '@/store/contracts-store'
import { useAssetData } from '@/hooks/useAssetData'
import type { ESIContractItem } from '@/api/endpoints/contracts'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { useAssetStore } from '@/store/asset-store'
import { cn, formatNumber } from '@/lib/utils'
import { ContractsTable } from './ContractsTable'
import {
  type ContractDirection,
  type ContractRow,
  type DirectionGroup,
  buildContractRow,
  getContractValue,
} from './contracts-utils'

function DirectionGroupRow({
  group,
  isExpanded,
  onToggle,
  prices,
}: {
  group: DirectionGroup
  isExpanded: boolean
  onToggle: () => void
  prices: Map<number, number>
}) {
  const colorClass =
    group.direction === 'in' ? 'text-status-positive' : 'text-status-warning'

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary/50 text-left text-sm"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-content-secondary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-content-secondary" />
        )}
        <span className={cn('flex-1', colorClass)}>{group.displayName}</span>
        <span className="text-xs text-content-secondary">
          {group.contracts.length} contract
          {group.contracts.length !== 1 ? 's' : ''}
        </span>
        <span className="text-sm text-status-highlight tabular-nums">
          {group.totalValue > 0 && formatNumber(group.totalValue)}
        </span>
      </button>
      {isExpanded && (
        <div className="border-t border-border/50 bg-surface/30 px-4 pb-2">
          <ContractsTable contracts={group.contracts} prices={prices} />
        </div>
      )}
    </div>
  )
}

export function ContractsTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const prices = useAssetStore((s) => s.prices)
  const getContractsByOwner = useContractsStore((s) => s.getContractsByOwner)
  const contractsUpdating = useContractsStore((s) => s.isUpdating)
  const updateError = useContractsStore((s) => s.updateError)
  const init = useContractsStore((s) => s.init)
  const initialized = useContractsStore((s) => s.initialized)
  const updateCounter = useContractsStore((s) => s.updateCounter)

  const contractsByOwner = useMemo(
    () => getContractsByOwner(),
    [getContractsByOwner, updateCounter]
  )

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || contractsUpdating

  const [loadedItems, setLoadedItems] = useState<Map<number, ESIContractItem[]>>(
    new Map()
  )

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const itemsMap = new Map<number, ESIContractItem[]>()
    for (const { contracts } of contractsByOwner) {
      for (const { contract, items } of contracts) {
        if (items) {
          itemsMap.set(contract.contract_id, items)
        }
      }
    }
    setLoadedItems(itemsMap)
  }, [contractsByOwner, updateCounter])

  const cacheVersion = useCacheVersion()

  const [expandedDirections, setExpandedDirections] = useState<Set<string>>(
    new Set(['in', 'out'])
  )
  const [showCourier, setShowCourier] = useState(true)

  const {
    setExpandCollapse,
    search,
    setResultCount,
    setTotalValue,
    setColumns,
  } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const CONTRACT_COLUMNS: ColumnConfig[] = useMemo(
    () => [
      { id: 'status', label: 'Status' },
      { id: 'type', label: 'Type' },
      { id: 'items', label: 'Items' },
      { id: 'location', label: 'Location' },
      { id: 'assignee', label: 'Assignee' },
      { id: 'price', label: 'Price' },
      { id: 'value', label: 'Value' },
      { id: 'expires', label: 'Expires' },
      { id: 'owner', label: 'Owner' },
    ],
    []
  )

  const { getColumnsForDropdown } = useColumnSettings('contracts', CONTRACT_COLUMNS)

  const { directionGroups, courierGroup } = useMemo(() => {
    void cacheVersion

    const filteredContractsByOwner = contractsByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    const ownerIds = new Set<number>()
    for (const owner of owners) {
      ownerIds.add(owner.characterId)
    }

    const groups: Record<ContractDirection, DirectionGroup> = {
      in: {
        direction: 'in',
        displayName: 'Contracts Received',
        contracts: [],
        totalValue: 0,
      },
      out: {
        direction: 'out',
        displayName: 'Contracts Sent',
        contracts: [],
        totalValue: 0,
      },
    }

    const courier: ContractRow[] = []
    const seenContracts = new Set<number>()

    for (const { owner, contracts } of filteredContractsByOwner) {
      for (const contractWithItems of contracts) {
        const contract = contractWithItems.contract

        if (seenContracts.has(contract.contract_id)) continue
        seenContracts.add(contract.contract_id)

        const isActive =
          contract.status === 'outstanding' || contract.status === 'in_progress'
        if (!isActive) continue

        const isIssuer = ownerIds.has(contract.issuer_id)
        const isCourier = contract.type === 'courier'

        const row = buildContractRow(
          contractWithItems,
          owner.type,
          owner.id,
          isIssuer,
          loadedItems,
          prices
        )

        if (isCourier) {
          courier.push(row)
        } else {
          groups[row.direction].contracts.push(row)
          groups[row.direction].totalValue += getContractValue(contract)
        }
      }
    }

    const filterAndSort = (
      contracts: ContractRow[]
    ): { filtered: ContractRow[]; totalValue: number } => {
      const searchLower = search.toLowerCase()
      let totalValue = 0

      const filtered = contracts.filter((row) => {
        if (search) {
          const matches =
            row.typeName.toLowerCase().includes(searchLower) ||
            row.assignerName.toLowerCase().includes(searchLower) ||
            row.locationName.toLowerCase().includes(searchLower) ||
            row.assigneeName.toLowerCase().includes(searchLower)
          if (!matches) return false
        }
        totalValue += row.itemValue
        return true
      })

      filtered.sort((a, b) => b.itemValue - a.itemValue)
      return { filtered, totalValue }
    }

    const inResult = filterAndSort(groups.in.contracts)
    const outResult = filterAndSort(groups.out.contracts)
    const courierResult = filterAndSort(courier)

    return {
      directionGroups: [
        {
          ...groups.in,
          contracts: inResult.filtered,
          totalValue: inResult.totalValue,
        },
        {
          ...groups.out,
          contracts: outResult.filtered,
          totalValue: outResult.totalValue,
        },
      ].filter((g) => g.contracts.length > 0),
      courierGroup:
        courierResult.filtered.length > 0
          ? {
              direction: 'out' as ContractDirection,
              displayName: 'Active Couriers',
              contracts: courierResult.filtered,
              totalValue: courierResult.totalValue,
            }
          : null,
    }
  }, [contractsByOwner, cacheVersion, owners, prices, search, selectedSet, loadedItems])

  const toggleDirection = useCallback((direction: string) => {
    setExpandedDirections((prev) => {
      const next = new Set(prev)
      if (next.has(direction)) next.delete(direction)
      else next.add(direction)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedDirections(new Set(['in', 'out']))
  }, [])

  const collapseAll = useCallback(() => {
    setExpandedDirections(new Set())
  }, [])

  const expandableDirections = ['in', 'out'] as const
  const isAllExpanded = expandableDirections.every((d) => expandedDirections.has(d))

  useEffect(() => {
    setExpandCollapse({
      isExpanded: isAllExpanded,
      toggle: () => {
        if (isAllExpanded) collapseAll()
        else expandAll()
      },
    })
    return () => setExpandCollapse(null)
  }, [isAllExpanded, expandAll, collapseAll, setExpandCollapse])

  const { totals, contractPrice, totalCollateral } = useMemo(() => {
    let activeCount = 0
    let valueIn = 0
    let valueOut = 0
    let contractPriceSum = 0

    for (const group of directionGroups) {
      activeCount += group.contracts.length
      if (group.direction === 'in') {
        valueIn = group.totalValue
      } else {
        valueOut = group.totalValue
      }
      for (const row of group.contracts) {
        contractPriceSum +=
          (row.contractWithItems.contract.price ?? 0) +
          (row.contractWithItems.contract.reward ?? 0)
      }
    }

    let collateralSum = 0
    if (courierGroup) {
      for (const row of courierGroup.contracts) {
        collateralSum += row.contractWithItems.contract.collateral ?? 0
      }
    }

    const courierCount = courierGroup?.contracts.length ?? 0

    return {
      totals: { activeCount, valueIn, valueOut, courierCount },
      contractPrice: contractPriceSum,
      totalCollateral: collateralSum,
    }
  }, [directionGroups, courierGroup])

  useEffect(() => {
    const showingCount = totals.activeCount + totals.courierCount
    setResultCount({ showing: showingCount, total: showingCount })
    return () => setResultCount(null)
  }, [totals.activeCount, totals.courierCount, setResultCount])

  useEffect(() => {
    setTotalValue({
      value: totals.valueIn + totals.valueOut,
      label: 'Contract Items',
      secondaryValue: contractPrice,
      secondaryLabel: 'Contract Price',
      tertiaryValue: totalCollateral > 0 ? totalCollateral : undefined,
      tertiaryLabel: 'Collateral',
    })
    return () => setTotalValue(null)
  }, [totals.valueIn, totals.valueOut, contractPrice, totalCollateral, setTotalValue])

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

  return (
    <div className="h-full overflow-auto">
      {directionGroups.length === 0 && !courierGroup ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-content-secondary">No active contracts.</p>
        </div>
      ) : (
        <>
          {directionGroups.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-secondary/30">
              {directionGroups.map((group) => (
                <DirectionGroupRow
                  key={group.direction}
                  group={group}
                  isExpanded={expandedDirections.has(group.direction)}
                  onToggle={() => toggleDirection(group.direction)}
                  prices={prices}
                />
              ))}
            </div>
          )}
          {courierGroup && (
            <>
              {directionGroups.length > 0 && <div className="h-4" />}
              <div className="rounded-lg border border-border bg-surface-secondary/30">
                <button
                  onClick={() => setShowCourier(!showCourier)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary/50 text-left text-sm"
                >
                  {showCourier ? (
                    <ChevronDown className="h-4 w-4 text-content-secondary" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-content-secondary" />
                  )}
                  <Truck className="h-4 w-4 text-status-info" />
                  <span className="text-status-info flex-1">
                    {courierGroup.displayName}
                  </span>
                  <span className="text-xs text-content-secondary">
                    {courierGroup.contracts.length} contract
                    {courierGroup.contracts.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm text-status-highlight tabular-nums">
                    {courierGroup.totalValue > 0 &&
                      formatNumber(courierGroup.totalValue)}
                  </span>
                </button>
                {showCourier && (
                  <div className="border-t border-border/50 bg-surface/30 px-4 pb-2">
                    <ContractsTable
                      contracts={courierGroup.contracts}
                      showCourierColumns
                      prices={prices}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
