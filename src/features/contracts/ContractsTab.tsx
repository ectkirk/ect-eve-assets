import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  ArrowRightLeft,
  Gavel,
  Truck,
  HelpCircle,
  History,
  Package,
  Loader2,
} from 'lucide-react'
import { useTabControls } from '@/context'
import { useColumnSettings, useCacheVersion, useSortable, SortableHeader, sortRows, type ColumnConfig } from '@/hooks'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useContractsStore, type ContractWithItems } from '@/store/contracts-store'
import { useAssetData } from '@/hooks/useAssetData'
import { type ESIContract, type ESIContractItem } from '@/api/endpoints/contracts'
import { hasType, getType } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { useAssetStore } from '@/store/asset-store'
import { getName } from '@/api/endpoints/universe'
import { isAbyssalTypeId, getCachedAbyssalPrice } from '@/api/mutamarket-client'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatNumber } from '@/lib/utils'
import { getLocationName } from '@/lib/location-utils'
import { TypeIcon as ItemTypeIcon } from '@/components/ui/type-icon'
import { ContractItemsDialog } from '@/components/dialogs/ContractItemsDialog'

type ContractSortColumn = 'type' | 'items' | 'location' | 'assigner' | 'assignee' | 'price' | 'value' | 'expires' | 'completed' | 'volume' | 'collateral' | 'days'

const CONTRACT_TYPE_NAMES: Record<ESIContract['type'], string> = {
  unknown: 'Unknown',
  item_exchange: 'Item Exchange',
  auction: 'Auction',
  courier: 'Courier',
  loan: 'Loan',
}

const CONTRACT_TYPE_ICONS: Record<ESIContract['type'], React.ElementType> = {
  unknown: HelpCircle,
  item_exchange: ArrowRightLeft,
  auction: Gavel,
  courier: Truck,
  loan: ArrowRightLeft,
}

type ContractDirection = 'out' | 'in'

interface ContractRow {
  contractWithItems: ContractWithItems
  items: ESIContractItem[]
  ownerType: 'character' | 'corporation'
  ownerId: number
  locationName: string
  endLocationName: string
  firstItemTypeId?: number
  firstItemCategoryId?: number
  firstItemIsBlueprintCopy?: boolean
  typeName: string
  direction: ContractDirection
  assignerName: string
  assigneeName: string
  itemValue: number
  status: ESIContract['status']
  dateCompleted?: string
}

interface DirectionGroup {
  direction: ContractDirection
  displayName: string
  contracts: ContractRow[]
  totalValue: number
}

function formatExpiry(dateExpired: string): { text: string; isExpired: boolean } {
  const expiry = new Date(dateExpired).getTime()
  const now = Date.now()
  const remaining = expiry - now

  if (remaining <= 0) {
    return { text: 'Expired', isExpired: true }
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return { text: `${days}d`, isExpired: false }
  }

  return { text: `${hours}h`, isExpired: false }
}

function getContractValue(contract: ESIContract): number {
  return (contract.price ?? 0) + (contract.reward ?? 0)
}

const PAGE_SIZE = 50

function getDefaultSort(showCourierColumns: boolean, showCompletedDate: boolean): ContractSortColumn {
  if (showCompletedDate) return 'completed'
  if (showCourierColumns) return 'price'
  return 'value'
}

function getDaysLeft(contract: ESIContract): number {
  if (contract.status === 'outstanding') {
    const expiryTime = new Date(contract.date_expired).getTime()
    return Math.ceil((expiryTime - Date.now()) / (24 * 60 * 60 * 1000))
  } else if (contract.status === 'in_progress' && contract.date_accepted && contract.days_to_complete) {
    const acceptedDate = new Date(contract.date_accepted).getTime()
    const deadline = acceptedDate + contract.days_to_complete * 24 * 60 * 60 * 1000
    return Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000))
  }
  return 0
}

function buildContractRow(
  contractWithItems: ContractWithItems,
  ownerType: 'character' | 'corporation',
  ownerId: number,
  isIssuer: boolean,
  loadedItems: Map<number, ESIContractItem[]>,
  prices: Map<number, number>
): ContractRow {
  const contract = contractWithItems.contract
  const items = loadedItems.get(contract.contract_id) ?? []
  const direction: ContractDirection = isIssuer ? 'out' : 'in'

  const firstItem = items[0]
  const firstItemType = firstItem && hasType(firstItem.type_id) ? getType(firstItem.type_id) : undefined

  const assignerName = getName(contract.issuer_id)?.name ?? `ID ${contract.issuer_id}`

  let assigneeName: string
  if (contract.availability === 'public') {
    assigneeName = 'Public'
  } else if (contract.assignee_id) {
    assigneeName = getName(contract.assignee_id)?.name ?? `ID ${contract.assignee_id}`
  } else {
    assigneeName = '-'
  }

  let itemValue = 0
  for (const item of items) {
    if (item.is_blueprint_copy) continue
    let price: number
    if (isAbyssalTypeId(item.type_id) && item.item_id) {
      price = getCachedAbyssalPrice(item.item_id) ?? 0
    } else {
      price = prices.get(item.type_id) ?? 0
    }
    itemValue += price * item.quantity
  }

  return {
    contractWithItems,
    items,
    ownerType,
    ownerId,
    locationName: getLocationName(contract.start_location_id),
    endLocationName: contract.end_location_id ? getLocationName(contract.end_location_id) : '',
    firstItemTypeId: firstItem?.type_id,
    firstItemCategoryId: firstItemType?.categoryId,
    firstItemIsBlueprintCopy: firstItem?.is_blueprint_copy,
    typeName: firstItemType?.name ?? (firstItem ? `Unknown Type ${firstItem.type_id}` : ''),
    direction,
    assignerName,
    assigneeName,
    itemValue,
    status: contract.status,
    dateCompleted: contract.date_completed,
  }
}

function ContractsTable({
  contracts,
  showCourierColumns = false,
  showCompletedDate = false,
  prices,
}: {
  contracts: ContractRow[]
  showCourierColumns?: boolean
  showCompletedDate?: boolean
  prices: Map<number, number>
}) {
  const [page, setPage] = useState(0)
  const [selectedContract, setSelectedContract] = useState<ContractRow | null>(null)
  const { sortColumn, sortDirection, handleSort } = useSortable<ContractSortColumn>(getDefaultSort(showCourierColumns, showCompletedDate), 'desc')

  const sortedContracts = useMemo(() => {
    return sortRows(contracts, sortColumn, sortDirection, (row, column) => {
      const contract = row.contractWithItems.contract
      switch (column) {
        case 'type':
          return CONTRACT_TYPE_NAMES[contract.type].toLowerCase()
        case 'items':
          return row.typeName.toLowerCase()
        case 'location':
          return row.locationName.toLowerCase()
        case 'assigner':
          return row.assignerName.toLowerCase()
        case 'assignee':
          return row.assigneeName.toLowerCase()
        case 'price':
          return getContractValue(contract)
        case 'value':
          return row.itemValue
        case 'expires':
          return new Date(contract.date_expired).getTime()
        case 'completed':
          return row.dateCompleted ? new Date(row.dateCompleted).getTime() : 0
        case 'volume':
          return contract.volume ?? 0
        case 'collateral':
          return contract.collateral ?? 0
        case 'days':
          return getDaysLeft(contract)
        default:
          return 0
      }
    })
  }, [contracts, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedContracts.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const paginatedContracts = sortedContracts.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)

  return (
  <>
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <th className="w-8"></th>
          <SortableHeader column="type" label="Type" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
          {!showCourierColumns && <SortableHeader column="items" label="Items" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />}
          <SortableHeader column="location" label="Location" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
          <SortableHeader column="assigner" label="Assigner" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
          <SortableHeader column="assignee" label="Assignee" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
          <SortableHeader column="price" label="Price" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
          {!showCourierColumns && !showCompletedDate && <SortableHeader column="value" label="Value" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />}
          {showCourierColumns && (
            <>
              <SortableHeader column="volume" label="Volume" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
              <SortableHeader column="collateral" label="Collateral" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
              <SortableHeader column="days" label="Days Left" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
            </>
          )}
          {showCompletedDate ? (
            <SortableHeader column="completed" label="Completed" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
          ) : !showCourierColumns ? (
            <SortableHeader column="expires" label="Expires" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
          ) : null}
          <th className="text-right">Status</th>
        </TableRow>
      </TableHeader>
      <TableBody>
        {paginatedContracts.map((row) => {
          const contract = row.contractWithItems.contract
          const items = row.items
          const TypeIcon = CONTRACT_TYPE_ICONS[contract.type]
          const expiry = formatExpiry(contract.date_expired)
          const value = getContractValue(contract)
          const hasMultipleItems = items.length > 1

          return (
            <TableRow key={contract.contract_id}>
                <TableCell className="py-1.5 w-8">
                  <img
                    src={row.ownerType === 'corporation'
                      ? `https://images.evetech.net/corporations/${row.ownerId}/logo?size=32`
                      : `https://images.evetech.net/characters/${row.ownerId}/portrait?size=32`
                    }
                    alt=""
                    className="size-6 rounded object-cover"
                  />
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <TypeIcon className="h-4 w-4 text-content-secondary" />
                    <span>{CONTRACT_TYPE_NAMES[contract.type]}</span>
                  </div>
                </TableCell>
                {!showCourierColumns && (
                  <TableCell className="py-1.5">
                    <div className="flex items-center gap-2">
                      {hasMultipleItems ? (
                        <button
                          onClick={() => setSelectedContract(row)}
                          className="flex items-center gap-1.5 hover:text-link text-accent"
                        >
                          <Package className="h-4 w-4" />
                          <span>[Multiple Items]</span>
                        </button>
                      ) : (
                        <>
                          {items.length === 1 && row.firstItemTypeId && (
                            <ItemTypeIcon
                              typeId={row.firstItemTypeId}
                              categoryId={row.firstItemCategoryId}
                              isBlueprintCopy={row.firstItemIsBlueprintCopy}
                            />
                          )}
                          <span className={cn('truncate', row.firstItemIsBlueprintCopy && 'text-status-special')} title={row.typeName}>
                            {items.length === 0 ? '' : row.typeName}
                          </span>
                        </>
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell className="py-1.5 text-content-secondary">
                  <span className="truncate" title={row.locationName}>
                    {row.locationName}
                  </span>
                  {contract.type === 'courier' && row.endLocationName && (
                    <span className="text-content-muted"> → {row.endLocationName}</span>
                  )}
                </TableCell>
                <TableCell className="py-1.5 text-content-secondary">{row.assignerName}</TableCell>
                <TableCell className="py-1.5 text-content-secondary">{row.assigneeName}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
                  {value > 0 ? formatNumber(value) : '-'}
                </TableCell>
                {!showCourierColumns && !showCompletedDate && (
                  <TableCell className="py-1.5 text-right tabular-nums text-status-positive">
                    {row.itemValue > 0 ? formatNumber(row.itemValue) : '-'}
                  </TableCell>
                )}
                {showCourierColumns && (() => {
                  let daysDisplay = '-'
                  let daysColor = 'text-content-secondary'

                  if (contract.status === 'outstanding') {
                    const expiryTime = new Date(contract.date_expired).getTime()
                    const remaining = expiryTime - Date.now()
                    const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000))
                    if (daysLeft <= 0) {
                      daysDisplay = 'Expired'
                      daysColor = 'text-status-negative'
                    } else {
                      daysDisplay = `${daysLeft}d`
                      daysColor = daysLeft <= 1 ? 'text-status-negative' : daysLeft <= 3 ? 'text-status-highlight' : 'text-content-secondary'
                    }
                  } else if (contract.status === 'in_progress' && contract.date_accepted && contract.days_to_complete) {
                    const acceptedDate = new Date(contract.date_accepted).getTime()
                    const deadline = acceptedDate + contract.days_to_complete * 24 * 60 * 60 * 1000
                    const remaining = deadline - Date.now()
                    const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000))
                    daysDisplay = daysLeft > 0 ? `${daysLeft}d` : 'Overdue'
                    daysColor = daysLeft <= 1 ? 'text-status-negative' : daysLeft <= 3 ? 'text-status-highlight' : 'text-content-secondary'
                  }

                  return (
                    <>
                      <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
                        {contract.volume ? `${contract.volume.toLocaleString()} m³` : '-'}
                      </TableCell>
                      <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
                        {contract.collateral ? formatNumber(contract.collateral) : '-'}
                      </TableCell>
                      <TableCell className={cn('py-1.5 text-right tabular-nums', daysColor)}>
                        {daysDisplay}
                      </TableCell>
                    </>
                  )
                })()}
                {showCompletedDate ? (
                  <TableCell className="py-1.5 text-right tabular-nums text-content-secondary">
                    {row.dateCompleted ? new Date(row.dateCompleted).toLocaleDateString() : '-'}
                  </TableCell>
                ) : !showCourierColumns ? (
                  <TableCell
                    className={cn(
                      'py-1.5 text-right tabular-nums',
                      expiry.isExpired ? 'text-status-negative' : 'text-content-secondary'
                    )}
                  >
                    {expiry.text}
                  </TableCell>
                ) : null}
                <TableCell className="py-1.5 text-right">
                  {row.status === 'outstanding' && <span className="text-status-highlight">Outstanding</span>}
                  {row.status === 'in_progress' && <span className="text-status-info">In Progress</span>}
                  {(row.status === 'finished' || row.status === 'finished_issuer' || row.status === 'finished_contractor') && (
                    <span className="text-status-positive">Finished</span>
                  )}
                  {row.status === 'cancelled' && <span className="text-content-secondary">Cancelled</span>}
                  {row.status === 'rejected' && <span className="text-status-negative">Rejected</span>}
                  {row.status === 'failed' && <span className="text-status-negative">Failed</span>}
                  {row.status === 'deleted' && <span className="text-content-muted">Deleted</span>}
                  {row.status === 'reversed' && <span className="text-status-warning">Reversed</span>}
                </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
    {totalPages > 1 && (
      <div className="flex items-center justify-between px-2 py-2 text-sm">
        <span className="text-content-secondary">
          {clampedPage * PAGE_SIZE + 1}-{Math.min((clampedPage + 1) * PAGE_SIZE, sortedContracts.length)} of {sortedContracts.length}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setPage(0)}
            disabled={clampedPage === 0}
            className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            First
          </button>
          <button
            onClick={() => setPage(clampedPage - 1)}
            disabled={clampedPage === 0}
            className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-2 py-1 text-content-secondary">
            {clampedPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(clampedPage + 1)}
            disabled={clampedPage >= totalPages - 1}
            className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={clampedPage >= totalPages - 1}
            className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Last
          </button>
        </div>
      </div>
    )}

    <ContractItemsDialog
      open={selectedContract !== null}
      onOpenChange={(open) => !open && setSelectedContract(null)}
      items={selectedContract?.items ?? []}
      contractType={selectedContract ? CONTRACT_TYPE_NAMES[selectedContract.contractWithItems.contract.type] : ''}
      prices={prices}
    />
  </>
  )
}

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
  const colorClass = group.direction === 'in' ? 'text-status-positive' : 'text-status-warning'

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
          {group.contracts.length} contract{group.contracts.length !== 1 ? 's' : ''}
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
  const contractsByOwner = useContractsStore((s) => s.contractsByOwner)
  const contractsUpdating = useContractsStore((s) => s.isUpdating)
  const fetchItemsForContract = useContractsStore((s) => s.fetchItemsForContract)
  const updateError = useContractsStore((s) => s.updateError)
  const init = useContractsStore((s) => s.init)
  const initialized = useContractsStore((s) => s.initialized)
  const updateCounter = useContractsStore((s) => s.updateCounter)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || contractsUpdating

  const [loadedItems, setLoadedItems] = useState<Map<number, ESIContractItem[]>>(new Map())
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [fetchedContractIds, setFetchedContractIds] = useState<Set<number>>(new Set())

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

  const [expandedDirections, setExpandedDirections] = useState<Set<string>>(new Set(['in', 'out']))
  const [showCourier, setShowCourier] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    if (!showCompleted) return

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
    const FINISHED_STATUSES = new Set(['finished', 'finished_issuer', 'finished_contractor'])

    const fetchCompletedItems = async () => {
      const contractsToFetch = new Set<number>()

      for (const { contracts } of contractsByOwner) {
        for (const { contract } of contracts) {
          if (loadedItems.has(contract.contract_id)) continue
          if (fetchedContractIds.has(contract.contract_id)) continue
          if (contractsToFetch.has(contract.contract_id)) continue

          const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
          if (isActive) continue

          const isItemContract = contract.type === 'item_exchange' || contract.type === 'auction'
          const isFinished = FINISHED_STATUSES.has(contract.status)
          const refTime = new Date(contract.date_completed ?? contract.date_expired).getTime()
          const isWithin30Days = Date.now() - refTime < THIRTY_DAYS_MS

          if (isItemContract && isFinished && isWithin30Days) {
            contractsToFetch.add(contract.contract_id)
          }
        }
      }

      if (contractsToFetch.size === 0) return

      setFetchedContractIds(prev => new Set([...prev, ...contractsToFetch]))

      setIsLoadingItems(true)
      try {
        for (const id of contractsToFetch) {
          await fetchItemsForContract(id)
        }
      } finally {
        setIsLoadingItems(false)
      }
    }

    fetchCompletedItems()
  }, [showCompleted, contractsByOwner, fetchItemsForContract, fetchedContractIds, loadedItems])

  const { setExpandCollapse, search, setResultCount, setTotalValue, setColumns } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const CONTRACT_COLUMNS: ColumnConfig[] = useMemo(() => [
    { id: 'status', label: 'Status' },
    { id: 'type', label: 'Type' },
    { id: 'items', label: 'Items' },
    { id: 'location', label: 'Location' },
    { id: 'assignee', label: 'Assignee' },
    { id: 'price', label: 'Price' },
    { id: 'value', label: 'Value' },
    { id: 'expires', label: 'Expires' },
    { id: 'owner', label: 'Owner' },
  ], [])

  const { getColumnsForDropdown } = useColumnSettings('contracts', CONTRACT_COLUMNS)

  const { directionGroups, courierGroup, completedContracts } = useMemo(() => {
    void cacheVersion

    const filteredContractsByOwner = contractsByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    const ownerIds = new Set<number>()
    for (const owner of owners) {
      ownerIds.add(owner.characterId)
    }

    const groups: Record<ContractDirection, DirectionGroup> = {
      in: { direction: 'in', displayName: 'Contracts Received', contracts: [], totalValue: 0 },
      out: { direction: 'out', displayName: 'Contracts Sent', contracts: [], totalValue: 0 },
    }

    const courier: ContractRow[] = []
    const completed: ContractRow[] = []
    const seenContracts = new Set<number>()

    for (const { owner, contracts } of filteredContractsByOwner) {
      for (const contractWithItems of contracts) {
        const contract = contractWithItems.contract

        if (seenContracts.has(contract.contract_id)) continue
        seenContracts.add(contract.contract_id)

        const isIssuer = ownerIds.has(contract.issuer_id)
        const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
        const isCourier = contract.type === 'courier'

        const row = buildContractRow(contractWithItems, owner.type, owner.id, isIssuer, loadedItems, prices)

        if (!isActive) {
          completed.push(row)
          continue
        }

        if (isCourier) {
          courier.push(row)
        } else {
          groups[row.direction].contracts.push(row)
          groups[row.direction].totalValue += getContractValue(contract)
        }
      }
    }

    const filterAndSort = (contracts: ContractRow[], sortByDate = false): { filtered: ContractRow[]; totalValue: number } => {
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

      if (sortByDate) {
        filtered.sort((a, b) => {
          const dateA = a.dateCompleted ? new Date(a.dateCompleted).getTime() : 0
          const dateB = b.dateCompleted ? new Date(b.dateCompleted).getTime() : 0
          return dateB - dateA
        })
      } else {
        filtered.sort((a, b) => b.itemValue - a.itemValue)
      }

      return { filtered, totalValue }
    }

    const inResult = filterAndSort(groups.in.contracts)
    const outResult = filterAndSort(groups.out.contracts)
    const courierResult = filterAndSort(courier)
    const completedResult = filterAndSort(completed, true)

    return {
      directionGroups: [
        { ...groups.in, contracts: inResult.filtered, totalValue: inResult.totalValue },
        { ...groups.out, contracts: outResult.filtered, totalValue: outResult.totalValue },
      ].filter((g) => g.contracts.length > 0),
      courierGroup: courierResult.filtered.length > 0
        ? { direction: 'out' as ContractDirection, displayName: 'Active Couriers', contracts: courierResult.filtered, totalValue: courierResult.totalValue }
        : null,
      completedContracts: completedResult.filtered,
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
        if (isAllExpanded) {
          collapseAll()
        } else {
          expandAll()
        }
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
        contractPriceSum += (row.contractWithItems.contract.price ?? 0) + (row.contractWithItems.contract.reward ?? 0)
      }
    }

    let collateralSum = 0
    if (courierGroup) {
      for (const row of courierGroup.contracts) {
        collateralSum += row.contractWithItems.contract.collateral ?? 0
      }
    }

    const courierCount = courierGroup?.contracts.length ?? 0
    const completedCount = completedContracts.length

    return {
      totals: { activeCount, valueIn, valueOut, courierCount, completedCount },
      contractPrice: contractPriceSum,
      totalCollateral: collateralSum,
    }
  }, [directionGroups, courierGroup, completedContracts])

  useEffect(() => {
    const showingCount = totals.activeCount + totals.courierCount + totals.completedCount
    setResultCount({ showing: showingCount, total: showingCount })
    return () => setResultCount(null)
  }, [totals.activeCount, totals.courierCount, totals.completedCount, setResultCount])

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
      {directionGroups.length === 0 && !courierGroup && completedContracts.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-content-secondary">No contracts.</p>
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
                  <span className="text-status-info flex-1">{courierGroup.displayName}</span>
                  <span className="text-xs text-content-secondary">
                    {courierGroup.contracts.length} contract
                    {courierGroup.contracts.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm text-status-highlight tabular-nums">
                    {courierGroup.totalValue > 0 && formatNumber(courierGroup.totalValue)}
                  </span>
                </button>
                {showCourier && (
                  <div className="border-t border-border/50 bg-surface/30 px-4 pb-2">
                    <ContractsTable contracts={courierGroup.contracts} showCourierColumns prices={prices} />
                  </div>
                )}
              </div>
            </>
          )}
          {completedContracts.length > 0 && (
            <>
              {(directionGroups.length > 0 || courierGroup) && <div className="h-4" />}
              <div className="rounded-lg border border-border bg-surface-secondary/30">
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary/50 text-left text-sm"
                >
                  {showCompleted ? (
                    <ChevronDown className="h-4 w-4 text-content-secondary" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-content-secondary" />
                  )}
                  <History className="h-4 w-4 text-content-secondary" />
                  <span className="text-content-secondary flex-1">Completed Contracts</span>
                  {isLoadingItems && (
                    <Loader2 className="h-4 w-4 text-content-secondary animate-spin" />
                  )}
                  <span className="text-xs text-content-secondary">
                    {completedContracts.length} contract
                    {completedContracts.length !== 1 ? 's' : ''}
                  </span>
                </button>
                {showCompleted && (
                  <div className="border-t border-border/50 bg-surface/30 px-4 pb-2">
                    <ContractsTable contracts={completedContracts} showCompletedDate prices={prices} />
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
