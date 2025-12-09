import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Loader2,
  RefreshCw,
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
import { type ESIContract } from '@/api/endpoints/contracts'
import { hasType, getType, hasLocation, getLocation, subscribe } from '@/store/reference-cache'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
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

interface ContractRow {
  contractWithItems: ContractWithItems
  ownerName: string
  locationName: string
  endLocationName: string
  firstItemTypeId?: number
  firstItemCategoryId?: number
  typeName: string
}

interface StatusGroup {
  status: string
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

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return ''
  const minutes = Math.ceil(ms / 60000)
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${minutes}m`
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

function getStatusDisplayName(status: ESIContract['status']): string {
  const names: Record<ESIContract['status'], string> = {
    outstanding: 'Outstanding',
    in_progress: 'In Progress',
    finished: 'Finished',
    finished_issuer: 'Finished',
    finished_contractor: 'Finished',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
    failed: 'Failed',
    deleted: 'Deleted',
    reversed: 'Reversed',
  }
  return names[status] || status
}

function getContractValue(contract: ESIContract): number {
  return (contract.price ?? 0) + (contract.reward ?? 0)
}

function ContractsTable({ contracts }: { contracts: ContractRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8"></TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Title / Items</TableHead>
          <TableHead>Location</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Expires</TableHead>
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

          const itemSummary =
            items.length > 0
              ? items.length === 1
                ? row.typeName
                : `${items.length} items`
              : contract.title || CONTRACT_TYPE_NAMES[contract.type]

          return (
            <TableRow key={contract.contract_id}>
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
                  {items.length === 1 && row.firstItemTypeId && (
                    <ItemTypeIcon
                      typeId={row.firstItemTypeId}
                      categoryId={row.firstItemCategoryId}
                    />
                  )}
                  <span className="truncate" title={itemSummary}>
                    {itemSummary}
                  </span>
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
              <TableCell className="py-1.5 text-right tabular-nums text-amber-400">
                {value > 0 ? formatISK(value) : '-'}
              </TableCell>
              <TableCell
                className={cn(
                  'py-1.5 text-right tabular-nums',
                  expiry.isExpired ? 'text-red-400' : 'text-slate-400'
                )}
              >
                {expiry.text}
              </TableCell>
              <TableCell className="py-1.5 text-slate-400">{row.ownerName}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function StatusGroupRow({
  group,
  isExpanded,
  onToggle,
}: {
  group: StatusGroup
  isExpanded: boolean
  onToggle: () => void
}) {
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
        <span className="font-medium text-blue-300 flex-1">{group.displayName}</span>
        <span className="text-xs text-slate-400 w-20 text-right">
          {group.contracts.length} contract{group.contracts.length !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-amber-400 w-28 text-right tabular-nums">
          {group.totalValue > 0 && formatISK(group.totalValue)}
        </span>
      </button>
      {isExpanded && (
        <div className="bg-slate-900/30 px-3 pb-2">
          <ContractsTable contracts={group.contracts} />
        </div>
      )}
    </div>
  )
}

export function ContractsTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const contractsByOwner = useContractsStore((s) => s.contractsByOwner)
  const lastUpdated = useContractsStore((s) => s.lastUpdated)
  const isUpdating = useContractsStore((s) => s.isUpdating)
  const updateError = useContractsStore((s) => s.updateError)
  const init = useContractsStore((s) => s.init)
  const update = useContractsStore((s) => s.update)
  const canUpdateFn = useContractsStore((s) => s.canUpdate)
  const getTimeUntilUpdateFn = useContractsStore((s) => s.getTimeUntilUpdate)
  const initialized = useContractsStore((s) => s.initialized)

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const canUpdate = canUpdateFn()
  const timeUntilUpdate = getTimeUntilUpdateFn()

  useEffect(() => {
    init()
  }, [init])

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => subscribe(() => setCacheVersion((v) => v + 1)), [])

  useEffect(() => {
    if (contractsByOwner.length === 0) return

    const unresolvedTypeIds = new Set<number>()
    const unknownLocationIds = new Set<number>()

    for (const { contracts } of contractsByOwner) {
      for (const { contract, items } of contracts) {
        if (contract.start_location_id && !hasLocation(contract.start_location_id)) {
          unknownLocationIds.add(contract.start_location_id)
        }
        if (contract.end_location_id && !hasLocation(contract.end_location_id)) {
          unknownLocationIds.add(contract.end_location_id)
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
  }, [contractsByOwner])

  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set(['outstanding', 'in_progress']))

  const statusGroups = useMemo(() => {
    void cacheVersion

    const groupMap = new Map<string, StatusGroup>()

    const statusOrder = [
      'outstanding',
      'in_progress',
      'finished',
      'finished_issuer',
      'finished_contractor',
      'cancelled',
      'rejected',
      'failed',
      'deleted',
      'reversed',
    ]

    for (const status of statusOrder) {
      groupMap.set(status, {
        status,
        displayName: getStatusDisplayName(status as ESIContract['status']),
        contracts: [],
        totalValue: 0,
      })
    }

    for (const { owner, contracts } of contractsByOwner) {
      for (const contractWithItems of contracts) {
        const contract = contractWithItems.contract
        const items = contractWithItems.items

        const location = contract.start_location_id
          ? hasLocation(contract.start_location_id)
            ? getLocation(contract.start_location_id)
            : undefined
          : undefined

        const endLocation = contract.end_location_id
          ? hasLocation(contract.end_location_id)
            ? getLocation(contract.end_location_id)
            : undefined
          : undefined

        const firstItem = items[0]
        const firstItemType =
          firstItem && hasType(firstItem.type_id) ? getType(firstItem.type_id) : undefined

        const row: ContractRow = {
          contractWithItems,
          ownerName: owner.name,
          locationName: location?.name ?? (contract.start_location_id ? `Location ${contract.start_location_id}` : '-'),
          endLocationName: endLocation?.name ?? '',
          firstItemTypeId: firstItem?.type_id,
          firstItemCategoryId: firstItemType?.categoryId,
          typeName: firstItemType?.name ?? (firstItem ? `Unknown Type ${firstItem.type_id}` : ''),
        }

        const group = groupMap.get(contract.status)
        if (group) {
          group.contracts.push(row)
          group.totalValue += getContractValue(contract)
        }
      }
    }

    return Array.from(groupMap.values()).filter((g) => g.contracts.length > 0)
  }, [contractsByOwner, cacheVersion])

  const toggleStatus = useCallback((status: string) => {
    setExpandedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allStatuses = statusGroups.map((g) => g.status)
    setExpandedStatuses(new Set(allStatuses))
  }, [statusGroups])

  const collapseAll = useCallback(() => {
    setExpandedStatuses(new Set())
  }, [])

  const totals = useMemo(() => {
    let totalContracts = 0
    let totalValue = 0
    let outstanding = 0

    for (const group of statusGroups) {
      totalContracts += group.contracts.length
      totalValue += group.totalValue
      if (group.status === 'outstanding' || group.status === 'in_progress') {
        outstanding += group.contracts.length
      }
    }

    return { totalContracts, totalValue, outstanding }
  }, [statusGroups])

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
            <p className="text-slate-400 mb-4">No contracts loaded. Click Update to fetch from ESI.</p>
          )}
          <button
            onClick={() => update()}
            disabled={!canUpdate}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {canUpdate ? 'Update Contracts' : `Update in ${formatTimeRemaining(timeUntilUpdate)}`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-400">Outstanding: </span>
            <span className="font-medium text-blue-400">{totals.outstanding}</span>
          </div>
          <div>
            <span className="text-slate-400">Total: </span>
            <span className="font-medium">{totals.totalContracts}</span>
          </div>
          <div>
            <span className="text-slate-400">Value: </span>
            <span className="font-medium text-amber-400">{formatISK(totals.totalValue)}</span>
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
          <button
            onClick={() => update()}
            disabled={!canUpdate || isUpdating}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            {isUpdating
              ? 'Updating...'
              : canUpdate
                ? 'Update'
                : formatTimeRemaining(timeUntilUpdate)}
          </button>
        </div>
      </div>

      <div
        className="rounded-lg border border-slate-700 overflow-auto"
        style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}
      >
        {statusGroups.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400">No contracts.</p>
          </div>
        ) : (
          statusGroups.map((group) => (
            <StatusGroupRow
              key={group.status}
              group={group}
              isExpanded={expandedStatuses.has(group.status)}
              onToggle={() => toggleStatus(group.status)}
            />
          ))
        )}
      </div>

      {lastUpdated && (
        <p className="text-xs text-slate-500 text-right">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  )
}
