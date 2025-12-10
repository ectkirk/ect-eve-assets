import React, { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Loader2,
  ChevronRight,
  ChevronDown,
  ArrowRightLeft,
  Gavel,
  Truck,
  HelpCircle,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
import { useContractsStore, type ContractWithItems } from '@/store/contracts-store'
import { useAssetData } from '@/hooks/useAssetData'
import { type ESIContract } from '@/api/endpoints/contracts'
import {
  hasType,
  getType,
  hasLocation,
  getLocation,
  hasStructure,
  getStructure,
  subscribe,
} from '@/store/reference-cache'
import { useAssetStore } from '@/store/asset-store'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import { resolveStructures, resolveNames, hasName, getName } from '@/api/endpoints/universe'
import { isAbyssalTypeId, fetchAbyssalPrices, hasCachedAbyssalPrice, getCachedAbyssalPrice } from '@/api/mutamarket-client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { TypeIcon as ItemTypeIcon } from '@/components/ui/type-icon'

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
  ownerName: string
  locationName: string
  endLocationName: string
  firstItemTypeId?: number
  firstItemCategoryId?: number
  typeName: string
  direction: ContractDirection
  assigneeName: string
  itemValue: number
  status: 'outstanding' | 'in_progress'
}

interface DirectionGroup {
  direction: ContractDirection
  displayName: string
  contracts: ContractRow[]
  totalValue: number
}

function formatISK(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B'
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M'
  if (value >= 1_000) return (value / 1_000).toFixed(2) + 'K'
  return value.toLocaleString()
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

function StatusIcon({ status }: { status: ESIContract['status'] }) {
  switch (status) {
    case 'outstanding':
      return <Clock className="h-4 w-4 text-blue-400" />
    case 'in_progress':
      return <Clock className="h-4 w-4 text-yellow-400" />
    case 'finished':
    case 'finished_issuer':
    case 'finished_contractor':
      return <CheckCircle2 className="h-4 w-4 text-green-400" />
    case 'cancelled':
    case 'rejected':
    case 'failed':
    case 'deleted':
      return <XCircle className="h-4 w-4 text-red-400" />
    case 'reversed':
      return <AlertCircle className="h-4 w-4 text-orange-400" />
    default:
      return <HelpCircle className="h-4 w-4 text-slate-400" />
  }
}

function getContractValue(contract: ESIContract): number {
  return (contract.price ?? 0) + (contract.reward ?? 0)
}

function ContractItemRow({
  item,
  cacheVersion,
}: {
  item: { type_id: number; quantity: number }
  cacheVersion: number
}) {
  void cacheVersion
  const type = hasType(item.type_id) ? getType(item.type_id) : undefined
  const typeName = type?.name ?? `Unknown Type ${item.type_id}`

  return (
    <TableRow className="bg-slate-800/30">
      <TableCell className="py-1 w-8" />
      <TableCell className="py-1" />
      <TableCell className="py-1 pl-8">
        <div className="flex items-center gap-2">
          <ItemTypeIcon typeId={item.type_id} categoryId={type?.categoryId} />
          <span className="text-slate-300">{typeName}</span>
          {item.quantity > 1 && (
            <span className="text-slate-500">x{item.quantity.toLocaleString()}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-1" />
      <TableCell className="py-1" />
      <TableCell className="py-1" />
      <TableCell className="py-1" />
      <TableCell className="py-1" />
      <TableCell className="py-1" />
      <TableCell className="py-1" />
    </TableRow>
  )
}

function ContractsTable({
  contracts,
  cacheVersion,
  showCourierColumns = false,
}: {
  contracts: ContractRow[]
  cacheVersion: number
  showCourierColumns?: boolean
}) {
  const [expandedContracts, setExpandedContracts] = useState<Set<number>>(new Set())

  const toggleContract = useCallback((contractId: number) => {
    setExpandedContracts((prev) => {
      const next = new Set(prev)
      if (next.has(contractId)) next.delete(contractId)
      else next.add(contractId)
      return next
    })
  }, [])

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8"></TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Title / Items</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Assignee</TableHead>
          <TableHead className="text-right">Price</TableHead>
          {!showCourierColumns && <TableHead className="text-right">Value</TableHead>}
          {showCourierColumns && (
            <>
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-right">Collateral</TableHead>
              <TableHead className="text-right">Days</TableHead>
            </>
          )}
          <TableHead className="text-right">Expires</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Owner</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contracts.map((row) => {
          const contract = row.contractWithItems.contract
          const items = row.contractWithItems.items
          const TypeIcon = CONTRACT_TYPE_ICONS[contract.type]
          const expiry = formatExpiry(contract.date_expired)
          const value = getContractValue(contract)
          const hasMultipleItems = items.length > 1
          const isExpanded = expandedContracts.has(contract.contract_id)

          const itemSummary =
            items.length > 0
              ? items.length === 1
                ? row.typeName
                : `${items.length} items`
              : contract.title || CONTRACT_TYPE_NAMES[contract.type]

          return (
            <React.Fragment key={contract.contract_id}>
              <TableRow>
                <TableCell className="py-1.5 w-8">
                  <StatusIcon status={contract.status} />
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <TypeIcon className="h-4 w-4 text-slate-400" />
                    <span>{CONTRACT_TYPE_NAMES[contract.type]}</span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    {hasMultipleItems ? (
                      <button
                        onClick={() => toggleContract(contract.contract_id)}
                        className="flex items-center gap-1 hover:text-blue-400"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                        <span>{itemSummary}</span>
                      </button>
                    ) : (
                      <>
                        {items.length === 1 && row.firstItemTypeId && (
                          <ItemTypeIcon
                            typeId={row.firstItemTypeId}
                            categoryId={row.firstItemCategoryId}
                          />
                        )}
                        <span className="truncate" title={itemSummary}>
                          {itemSummary}
                        </span>
                      </>
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-slate-400">
                  <span className="truncate" title={row.locationName}>
                    {row.locationName}
                  </span>
                  {contract.type === 'courier' && row.endLocationName && (
                    <span className="text-slate-500"> → {row.endLocationName}</span>
                  )}
                </TableCell>
                <TableCell className="py-1.5 text-slate-400">{row.assigneeName}</TableCell>
                <TableCell className="py-1.5 text-right tabular-nums text-amber-400">
                  {value > 0 ? formatISK(value) : '-'}
                </TableCell>
                {!showCourierColumns && (
                  <TableCell className="py-1.5 text-right tabular-nums text-green-400">
                    {row.itemValue > 0 ? formatISK(row.itemValue) : '-'}
                  </TableCell>
                )}
                {showCourierColumns && (
                  <>
                    <TableCell className="py-1.5 text-right tabular-nums text-slate-400">
                      {contract.volume ? `${contract.volume.toLocaleString()} m³` : '-'}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums text-amber-400">
                      {contract.collateral ? formatISK(contract.collateral) : '-'}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums text-slate-400">
                      {contract.days_to_complete ?? '-'}
                    </TableCell>
                  </>
                )}
                <TableCell
                  className={cn(
                    'py-1.5 text-right tabular-nums',
                    expiry.isExpired ? 'text-red-400' : 'text-slate-400'
                  )}
                >
                  {expiry.text}
                </TableCell>
                <TableCell className="py-1.5">
                  {row.status === 'in_progress' ? (
                    <span className="text-blue-400">In Progress</span>
                  ) : (
                    <span className="text-yellow-400">Outstanding</span>
                  )}
                </TableCell>
                <TableCell className="py-1.5 text-slate-400">{row.ownerName}</TableCell>
              </TableRow>
              {hasMultipleItems &&
                isExpanded &&
                items.map((item, idx) => (
                  <ContractItemRow key={idx} item={item} cacheVersion={cacheVersion} />
                ))}
            </React.Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function DirectionGroupRow({
  group,
  isExpanded,
  onToggle,
  cacheVersion,
}: {
  group: DirectionGroup
  isExpanded: boolean
  onToggle: () => void
  cacheVersion: number
}) {
  const colorClass = group.direction === 'in' ? 'text-green-400' : 'text-orange-400'

  return (
    <div className="border-b border-slate-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800/50 text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <span className={cn('font-medium flex-1', colorClass)}>{group.displayName}</span>
        <span className="text-xs text-slate-400 w-20 text-right">
          {group.contracts.length} contract{group.contracts.length !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-amber-400 w-28 text-right tabular-nums">
          {group.totalValue > 0 && formatISK(group.totalValue)}
        </span>
      </button>
      {isExpanded && (
        <div className="bg-slate-900/30 px-3 pb-2">
          <ContractsTable contracts={group.contracts} cacheVersion={cacheVersion} />
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
  const contractsLastUpdated = useContractsStore((s) => s.lastUpdated)
  const contractsUpdating = useContractsStore((s) => s.isUpdating)
  const updateError = useContractsStore((s) => s.updateError)
  const init = useContractsStore((s) => s.init)
  const initialized = useContractsStore((s) => s.initialized)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || contractsUpdating

  useEffect(() => {
    init()
  }, [init])

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => subscribe(() => setCacheVersion((v) => v + 1)), [])

  useEffect(() => {
    if (contractsByOwner.length === 0) return

    const unresolvedTypeIds = new Set<number>()
    const unknownLocationIds = new Set<number>()
    const structureToCharacter = new Map<number, number>()
    const unresolvedEntityIds = new Set<number>()

    const checkLocation = (locationId: number | undefined, characterId: number) => {
      if (!locationId) return
      if (locationId > 1_000_000_000_000) {
        if (!hasStructure(locationId)) {
          structureToCharacter.set(locationId, characterId)
        }
      } else if (!hasLocation(locationId)) {
        unknownLocationIds.add(locationId)
      }
    }

    for (const { owner, contracts } of contractsByOwner) {
      for (const { contract, items } of contracts) {
        checkLocation(contract.start_location_id, owner.characterId)
        checkLocation(contract.end_location_id, owner.characterId)
        if (contract.assignee_id && !hasName(contract.assignee_id)) {
          unresolvedEntityIds.add(contract.assignee_id)
        }
        for (const item of items) {
          const type = getType(item.type_id)
          if (!type || type.name.startsWith('Unknown Type ')) {
            unresolvedTypeIds.add(item.type_id)
          }
        }
      }
    }

    if (unresolvedTypeIds.size > 0) {
      resolveTypes(Array.from(unresolvedTypeIds)).catch(() => {})
    }
    if (unknownLocationIds.size > 0) {
      resolveLocations(Array.from(unknownLocationIds)).catch(() => {})
    }
    if (structureToCharacter.size > 0) {
      resolveStructures(structureToCharacter).catch(() => {})
    }
    if (unresolvedEntityIds.size > 0) {
      resolveNames(Array.from(unresolvedEntityIds)).catch(() => {})
    }
  }, [contractsByOwner])

  useEffect(() => {
    if (contractsByOwner.length === 0) return

    const abyssalItemIds: number[] = []
    for (const { contracts } of contractsByOwner) {
      for (const { items } of contracts) {
        for (const item of items) {
          if (item.item_id && isAbyssalTypeId(item.type_id) && !hasCachedAbyssalPrice(item.item_id)) {
            abyssalItemIds.push(item.item_id)
          }
        }
      }
    }

    if (abyssalItemIds.length > 0) {
      fetchAbyssalPrices(abyssalItemIds)
        .then(() => setCacheVersion((v) => v + 1))
        .catch(() => {})
    }
  }, [contractsByOwner])

  const [expandedDirections, setExpandedDirections] = useState<Set<string>>(new Set(['in', 'out']))
  const [showCourier, setShowCourier] = useState(true)

  const { directionGroups, courierGroup } = useMemo(() => {
    void cacheVersion

    const getLocationName = (locationId: number | undefined): string => {
      if (!locationId) return '-'
      if (locationId > 1_000_000_000_000) {
        const structure = hasStructure(locationId) ? getStructure(locationId) : undefined
        return structure?.name ?? `Structure ${locationId}`
      }
      const location = hasLocation(locationId) ? getLocation(locationId) : undefined
      return location?.name ?? `Location ${locationId}`
    }

    const ownerIds = new Set<number>()
    const ownerCorpIds = new Set<number>()
    for (const owner of owners) {
      ownerIds.add(owner.characterId)
      if (owner.corporationId) ownerCorpIds.add(owner.corporationId)
    }

    const groups: Record<ContractDirection, DirectionGroup> = {
      in: { direction: 'in', displayName: 'Contracts Received', contracts: [], totalValue: 0 },
      out: { direction: 'out', displayName: 'Contracts Sent', contracts: [], totalValue: 0 },
    }

    const courier: ContractRow[] = []
    let courierValue = 0

    const seenContracts = new Set<number>()

    for (const { owner, contracts } of contractsByOwner) {
      for (const contractWithItems of contracts) {
        const contract = contractWithItems.contract
        const items = contractWithItems.items

        if (seenContracts.has(contract.contract_id)) continue
        seenContracts.add(contract.contract_id)

        const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
        if (!isActive) continue

        const isIssuer = ownerIds.has(contract.issuer_id)

        const direction: ContractDirection = isIssuer ? 'out' : 'in'

        const firstItem = items[0]
        const firstItemType =
          firstItem && hasType(firstItem.type_id) ? getType(firstItem.type_id) : undefined

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
          let price: number
          if (isAbyssalTypeId(item.type_id) && item.item_id) {
            price = getCachedAbyssalPrice(item.item_id) ?? 0
          } else {
            price = prices.get(item.type_id) ?? 0
          }
          itemValue += price * item.quantity
        }

        const row: ContractRow = {
          contractWithItems,
          ownerName: owner.name,
          locationName: getLocationName(contract.start_location_id),
          endLocationName: contract.end_location_id ? getLocationName(contract.end_location_id) : '',
          firstItemTypeId: firstItem?.type_id,
          firstItemCategoryId: firstItemType?.categoryId,
          typeName: firstItemType?.name ?? (firstItem ? `Unknown Type ${firstItem.type_id}` : ''),
          direction,
          assigneeName,
          itemValue,
          status: contract.status as 'outstanding' | 'in_progress',
        }

        const isCourier = contract.type === 'courier'

        if (isCourier) {
          courier.push(row)
          courierValue += getContractValue(contract)
        } else {
          groups[direction].contracts.push(row)
          groups[direction].totalValue += getContractValue(contract)
        }
      }
    }

    return {
      directionGroups: [groups.in, groups.out].filter((g) => g.contracts.length > 0),
      courierGroup: courier.length > 0
        ? { direction: 'out' as ContractDirection, displayName: 'Active Couriers', contracts: courier, totalValue: courierValue }
        : null,
    }
  }, [contractsByOwner, cacheVersion, owners, prices])

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

  const totals = useMemo(() => {
    let totalContracts = 0
    let assetsIn = 0
    let assetsOut = 0
    let valueIn = 0
    let valueOut = 0

    for (const group of directionGroups) {
      totalContracts += group.contracts.length
      if (group.direction === 'in') {
        assetsIn = group.contracts.length
        valueIn = group.totalValue
      } else {
        assetsOut = group.contracts.length
        valueOut = group.totalValue
      }
    }

    return { totalContracts, assetsIn, assetsOut, valueIn, valueOut }
  }, [directionGroups])

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No characters logged in. Add a character to view contracts.</p>
      </div>
    )
  }

  if (!initialized || (isUpdating && contractsByOwner.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">Loading contracts...</p>
        </div>
      </div>
    )
  }

  if (contractsByOwner.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {updateError && (
            <>
              <p className="text-red-500">Failed to load contracts</p>
              <p className="text-sm text-slate-400 mb-4">{updateError}</p>
            </>
          )}
          {!updateError && (
            <p className="text-slate-400">No contracts loaded. Use the Update button in the header to fetch from ESI.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-400">In: </span>
            <span className="font-medium text-green-400">{totals.assetsIn}</span>
            {totals.valueIn > 0 && (
              <span className="text-slate-500 ml-1">({formatISK(totals.valueIn)})</span>
            )}
          </div>
          <div>
            <span className="text-slate-400">Out: </span>
            <span className="font-medium text-orange-400">{totals.assetsOut}</span>
            {totals.valueOut > 0 && (
              <span className="text-slate-500 ml-1">({formatISK(totals.valueOut)})</span>
            )}
          </div>
          <div>
            <span className="text-slate-400">Total: </span>
            <span className="font-medium">{totals.totalContracts}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
          >
            Collapse All
          </button>
        </div>
      </div>

      <div
        className="rounded-lg border border-slate-700 overflow-auto"
        style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}
      >
        {directionGroups.length === 0 && !courierGroup ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400">No active contracts.</p>
          </div>
        ) : (
          <>
            {directionGroups.map((group) => (
              <DirectionGroupRow
                key={group.direction}
                group={group}
                isExpanded={expandedDirections.has(group.direction)}
                onToggle={() => toggleDirection(group.direction)}
                cacheVersion={cacheVersion}
              />
            ))}
            {courierGroup && (
              <div className="border-t border-slate-600">
                <button
                  onClick={() => setShowCourier(!showCourier)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800/50 text-left"
                >
                  {showCourier ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                  <Truck className="h-4 w-4 text-blue-400" />
                  <span className="text-blue-300 flex-1">{courierGroup.displayName}</span>
                  <span className="text-xs text-slate-400 w-20 text-right">
                    {courierGroup.contracts.length} contract
                    {courierGroup.contracts.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-amber-400 w-28 text-right tabular-nums">
                    {courierGroup.totalValue > 0 && formatISK(courierGroup.totalValue)}
                  </span>
                </button>
                {showCourier && (
                  <div className="bg-slate-900/30 px-3 pb-2">
                    <ContractsTable contracts={courierGroup.contracts} cacheVersion={cacheVersion} showCourierColumns />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {contractsLastUpdated && (
        <p className="text-xs text-slate-500 text-right">
          Last updated: {new Date(contractsLastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  )
}
