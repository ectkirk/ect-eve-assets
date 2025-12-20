import { useEffect, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Hammer,
  FlaskConical,
  Copy,
  Atom,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
} from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import { useColumnSettings, useCacheVersion, useExpandCollapse, useSortable, SortableHeader, sortRows, type ColumnConfig } from '@/hooks'
import { type ESIIndustryJob } from '@/api/endpoints/industry'
import { hasType, getType } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatNumber } from '@/lib/utils'
import { getLocationName } from '@/lib/location-utils'
import { TypeIcon } from '@/components/ui/type-icon'

type JobSortColumn = 'activity' | 'blueprint' | 'product' | 'runs' | 'value' | 'cost' | 'time' | 'owner'

const BLUEPRINT_CATEGORY_ID = 9

const ACTIVITY_NAMES: Record<number, string> = {
  1: 'Manufacturing',
  3: 'TE Research',
  4: 'ME Research',
  5: 'Copying',
  7: 'Reverse Engineering',
  8: 'Invention',
  9: 'Reactions',
  11: 'Reactions',
}

const ACTIVITY_ICONS: Record<number, React.ElementType> = {
  1: Hammer,
  3: FlaskConical,
  4: FlaskConical,
  5: Copy,
  7: Atom,
  8: Atom,
  9: Atom,
  11: Atom,
}

interface JobRow {
  job: ESIIndustryJob
  ownerName: string
  blueprintName: string
  productName: string
  productCategoryId?: number
  locationName: string
  activityName: string
  productValue: number
}

interface LocationGroup {
  locationId: number
  locationName: string
  jobs: JobRow[]
  activeCount: number
  completedCount: number
  totalValue: number
}

function formatDuration(endDate: string): { text: string; isComplete: boolean; isPast: boolean } {
  const end = new Date(endDate).getTime()
  const now = Date.now()
  const remaining = end - now

  if (remaining <= 0) {
    return { text: 'Ready', isComplete: true, isPast: true }
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const h = hours % 24
    return { text: `${days}d ${h}h`, isComplete: false, isPast: false }
  }

  return { text: `${hours}h ${minutes}m`, isComplete: false, isPast: false }
}

function StatusIcon({ status }: { status: ESIIndustryJob['status'] }) {
  switch (status) {
    case 'active':
      return <Clock className="h-4 w-4 text-status-info" />
    case 'ready':
      return <CheckCircle2 className="h-4 w-4 text-status-positive" />
    case 'delivered':
      return <CheckCircle2 className="h-4 w-4 text-content-muted" />
    case 'cancelled':
    case 'reverted':
      return <XCircle className="h-4 w-4 text-status-negative" />
    case 'paused':
      return <PauseCircle className="h-4 w-4 text-status-highlight" />
    default:
      return <Clock className="h-4 w-4 text-content-secondary" />
  }
}

function getEndTime(endDate: string): number {
  return new Date(endDate).getTime()
}

function JobsTable({ jobs }: { jobs: JobRow[] }) {
  const { sortColumn, sortDirection, handleSort } = useSortable<JobSortColumn>('value', 'desc')

  const sortedJobs = useMemo(() => {
    return sortRows(jobs, sortColumn, sortDirection, (row, column) => {
      switch (column) {
        case 'activity':
          return row.activityName.toLowerCase()
        case 'blueprint':
          return row.blueprintName.toLowerCase()
        case 'product':
          return row.productName.toLowerCase()
        case 'runs':
          return row.job.runs
        case 'value':
          return row.productValue
        case 'cost':
          return row.job.cost ?? 0
        case 'time':
          return getEndTime(row.job.end_date)
        case 'owner':
          return row.ownerName.toLowerCase()
        default:
          return 0
      }
    })
  }, [jobs, sortColumn, sortDirection])

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <th className="w-8"></th>
          <SortableHeader column="activity" label="Activity" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
          <SortableHeader column="blueprint" label="Blueprint" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
          <SortableHeader column="product" label="Product" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
          <SortableHeader column="runs" label="Runs" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
          <SortableHeader column="value" label="Value" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
          <SortableHeader column="cost" label="Cost" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
          <SortableHeader column="time" label="Time" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
          <SortableHeader column="owner" label="Owner" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedJobs.map((row) => {
          const ActivityIcon = ACTIVITY_ICONS[row.job.activity_id] ?? Hammer
          const duration = formatDuration(row.job.end_date)

          return (
            <TableRow key={`${row.ownerName}-${row.job.job_id}`}>
              <TableCell className="py-1.5 w-8">
                <StatusIcon status={row.job.status} />
              </TableCell>
              <TableCell className="py-1.5">
                <div className="flex items-center gap-2">
                  <ActivityIcon className="h-4 w-4 text-content-secondary" />
                  <span>{row.activityName}</span>
                </div>
              </TableCell>
              <TableCell className="py-1.5">
                <div className="flex items-center gap-2">
                  <TypeIcon
                    typeId={row.job.blueprint_type_id}
                    categoryId={BLUEPRINT_CATEGORY_ID}
                  />
                  <span className="truncate" title={row.blueprintName}>
                    {row.blueprintName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-1.5">
                {row.job.product_type_id ? (
                  <div className="flex items-center gap-2">
                    <TypeIcon
                      typeId={row.job.product_type_id}
                      categoryId={row.productCategoryId}
                    />
                    <span className="truncate" title={row.productName}>
                      {row.productName}
                    </span>
                  </div>
                ) : (
                  <span className="text-content-muted">-</span>
                )}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums">
                {row.job.runs.toLocaleString()}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums text-status-positive">
                {row.productValue > 0 ? formatNumber(row.productValue) : '-'}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
                {row.job.cost ? formatNumber(row.job.cost) : '-'}
              </TableCell>
              <TableCell
                className={cn(
                  'py-1.5 text-right tabular-nums',
                  duration.isComplete && 'text-status-positive',
                  !duration.isComplete && 'text-content-secondary'
                )}
              >
                {duration.text}
              </TableCell>
              <TableCell className="py-1.5 text-right text-content-secondary">{row.ownerName}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function LocationGroupRow({
  group,
  isExpanded,
  onToggle,
}: {
  group: LocationGroup
  isExpanded: boolean
  onToggle: () => void
}) {
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
        <span className="text-status-info flex-1">{group.locationName}</span>
        <span className="text-xs text-status-info">
          {group.activeCount > 0 && `${group.activeCount} active`}
        </span>
        <span className="text-xs text-content-muted">
          {group.completedCount > 0 && `${group.completedCount} completed`}
        </span>
      </button>
      {isExpanded && (
        <div className="border-t border-border/50 bg-surface/30 px-4 pb-2">
          <JobsTable jobs={group.jobs} />
        </div>
      )}
    </div>
  )
}

export function IndustryJobsTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const prices = useAssetStore((s) => s.prices)
  const getJobsByOwner = useIndustryJobsStore((s) => s.getJobsByOwner)
  const updateCounter = useIndustryJobsStore((s) => s.updateCounter)
  const jobsCount = useIndustryJobsStore((s) => s.jobsById.size)
  const jobsUpdating = useIndustryJobsStore((s) => s.isUpdating)
  const updateError = useIndustryJobsStore((s) => s.updateError)
  const update = useIndustryJobsStore((s) => s.update)
  const initialized = useIndustryJobsStore((s) => s.initialized)

  const jobsByOwner = useMemo(() => getJobsByOwner(), [getJobsByOwner, updateCounter])

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || jobsUpdating

  useEffect(() => {
    if (initialized) {
      update()
    }
  }, [initialized, update])

  const cacheVersion = useCacheVersion()

  const { setExpandCollapse, search, setResultCount, setTotalValue, setColumns } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const JOB_COLUMNS: ColumnConfig[] = useMemo(() => [
    { id: 'status', label: 'Status' },
    { id: 'activity', label: 'Activity' },
    { id: 'blueprint', label: 'Blueprint' },
    { id: 'product', label: 'Product' },
    { id: 'runs', label: 'Runs' },
    { id: 'value', label: 'Value' },
    { id: 'cost', label: 'Cost' },
    { id: 'time', label: 'Time' },
    { id: 'owner', label: 'Owner' },
  ], [])

  const { getColumnsForDropdown } = useColumnSettings('industry-jobs', JOB_COLUMNS)

  const locationGroups = useMemo(() => {
    void cacheVersion

    const groups = new Map<number, LocationGroup>()

    const filteredJobsByOwner = jobsByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    for (const { owner, jobs } of filteredJobsByOwner) {
      for (const job of jobs) {
        const bpType = hasType(job.blueprint_type_id) ? getType(job.blueprint_type_id) : undefined
        const productType =
          job.product_type_id && hasType(job.product_type_id)
            ? getType(job.product_type_id)
            : undefined

        const productPrice = job.product_type_id ? (prices.get(job.product_type_id) ?? 0) : 0
        const productValue = productPrice * job.runs

        const locationId = job.location_id ?? job.facility_id

        const row: JobRow = {
          job,
          ownerName: owner.name,
          blueprintName: bpType?.name ?? `Unknown Type ${job.blueprint_type_id}`,
          productName: productType?.name ?? (job.product_type_id ? `Unknown Type ${job.product_type_id}` : ''),
          productCategoryId: productType?.categoryId,
          locationName: getLocationName(locationId),
          activityName: ACTIVITY_NAMES[job.activity_id] ?? `Activity ${job.activity_id}`,
          productValue,
        }

        let group = groups.get(locationId)
        if (!group) {
          group = {
            locationId,
            locationName: row.locationName,
            jobs: [],
            activeCount: 0,
            completedCount: 0,
            totalValue: 0,
          }
          groups.set(locationId, group)
        }

        group.jobs.push(row)
        group.totalValue += productValue
        if (job.status === 'active' || job.status === 'paused') {
          group.activeCount++
        } else {
          group.completedCount++
        }
      }
    }

    let sorted = Array.from(groups.values()).sort((a, b) => b.totalValue - a.totalValue)

    for (const group of sorted) {
      group.jobs.sort((a, b) => b.productValue - a.productValue)
    }

    if (search) {
      const searchLower = search.toLowerCase()
      sorted = sorted.map((group) => {
        const filteredJobs = group.jobs.filter((j) =>
          j.blueprintName.toLowerCase().includes(searchLower) ||
          j.productName.toLowerCase().includes(searchLower) ||
          j.ownerName.toLowerCase().includes(searchLower) ||
          j.locationName.toLowerCase().includes(searchLower) ||
          j.activityName.toLowerCase().includes(searchLower)
        )
        return {
          ...group,
          jobs: filteredJobs,
          activeCount: filteredJobs.filter((j) => j.job.status === 'active' || j.job.status === 'paused').length,
          completedCount: filteredJobs.filter((j) => j.job.status !== 'active' && j.job.status !== 'paused').length,
        }
      }).filter((g) => g.jobs.length > 0)
    }

    return sorted
  }, [jobsByOwner, cacheVersion, prices, search, selectedSet])

  const expandableIds = useMemo(() => locationGroups.map((g) => g.locationId), [locationGroups])
  const { isExpanded, toggle } = useExpandCollapse(expandableIds, setExpandCollapse)

  const totals = useMemo(() => {
    let activeCount = 0
    let completedCount = 0
    let totalCost = 0

    for (const group of locationGroups) {
      activeCount += group.activeCount
      completedCount += group.completedCount
      for (const row of group.jobs) {
        if (row.job.cost) totalCost += row.job.cost
      }
    }

    return { activeCount, completedCount, totalCost }
  }, [locationGroups])

  const totalJobCount = useMemo(() => {
    let count = 0
    for (const { jobs } of jobsByOwner) {
      count += jobs.length
    }
    return count
  }, [jobsByOwner])

  useEffect(() => {
    setResultCount({ showing: totals.activeCount + totals.completedCount, total: totalJobCount })
    return () => setResultCount(null)
  }, [totals.activeCount, totals.completedCount, totalJobCount, setResultCount])

  useEffect(() => {
    setTotalValue({ value: totals.totalCost })
    return () => setTotalValue(null)
  }, [totals.totalCost, setTotalValue])

  useEffect(() => {
    setColumns(getColumnsForDropdown())
    return () => setColumns([])
  }, [getColumnsForDropdown, setColumns])

  const loadingState = TabLoadingState({
    dataType: 'industry jobs',
    initialized,
    isUpdating,
    hasData: jobsCount > 0,
    hasOwners: owners.length > 0,
    updateError,
  })
  if (loadingState) return loadingState

  return (
    <div className="h-full rounded-lg border border-border bg-surface-secondary/30 overflow-auto">
      {locationGroups.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-content-secondary">No industry jobs.</p>
        </div>
      ) : (
        locationGroups.map((group) => (
          <LocationGroupRow
            key={group.locationId}
            group={group}
            isExpanded={isExpanded(group.locationId)}
            onToggle={() => toggle(group.locationId)}
          />
        ))
      )}
    </div>
  )
}
