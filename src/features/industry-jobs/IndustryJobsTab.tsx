import { useEffect, useMemo, useState } from 'react'
import { matchesSearchLower } from '@/lib/utils'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { usePriceStore, getJitaPrice } from '@/store/price-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useTabControls } from '@/context'
import {
  useColumnSettings,
  useSortable,
  SortableHeader,
  sortRows,
  type ColumnConfig,
} from '@/hooks'
import { type ESIIndustryJob } from '@/api/endpoints/industry'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatNumber } from '@/lib/utils'
import { getLocationName } from '@/lib/location-utils'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { Pagination } from '@/components/ui/pagination'

type JobSortColumn =
  | 'activity'
  | 'blueprint'
  | 'product'
  | 'runs'
  | 'value'
  | 'cost'
  | 'time'
  | 'location'

const BLUEPRINT_CATEGORY_ID = 9
const PAGE_SIZE = 50
const CONTAINER_CLASS =
  'h-full rounded-lg border border-border bg-surface-secondary/30 overflow-auto'

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

interface JobRow {
  job: ESIIndustryJob
  ownerId: number
  ownerType: 'character' | 'corporation'
  ownerName: string
  blueprintName: string
  productName: string
  productCategoryId?: number
  locationName: string
  activityName: string
  productValue: number
}

function formatDuration(endDate: string): {
  text: string
  isComplete: boolean
} {
  const end = new Date(endDate).getTime()
  const now = Date.now()
  const remaining = end - now

  if (remaining <= 0) {
    return { text: 'Ready', isComplete: true }
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const h = hours % 24
    return { text: `${days}d ${h}h`, isComplete: false }
  }

  return { text: `${hours}h ${minutes}m`, isComplete: false }
}

function getEndTime(endDate: string): number {
  return new Date(endDate).getTime()
}

interface JobsTableProps {
  jobs: JobRow[]
  visibleColumns: Set<string>
}

function JobsTable({ jobs, visibleColumns }: JobsTableProps) {
  const [page, setPage] = useState(0)
  const { sortColumn, sortDirection, handleSort } = useSortable<JobSortColumn>(
    'value',
    'desc'
  )

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
        case 'location':
          return row.locationName.toLowerCase()
        default:
          return 0
      }
    })
  }, [jobs, sortColumn, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const paginatedJobs = sortedJobs.slice(
    clampedPage * PAGE_SIZE,
    (clampedPage + 1) * PAGE_SIZE
  )

  const show = (col: string) => visibleColumns.has(col)

  return (
    <>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
          <TableRow className="hover:bg-transparent border-b border-border">
            {show('owner') && <TableHead className="w-8" />}
            {show('activity') && (
              <SortableHeader
                column="activity"
                label="Activity"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('blueprint') && (
              <SortableHeader
                column="blueprint"
                label="Blueprint"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('product') && (
              <SortableHeader
                column="product"
                label="Product"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('runs') && (
              <SortableHeader
                column="runs"
                label="Runs"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('value') && (
              <SortableHeader
                column="value"
                label="Value"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('cost') && (
              <SortableHeader
                column="cost"
                label="Cost"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('time') && (
              <SortableHeader
                column="time"
                label="Time"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('location') && (
              <SortableHeader
                column="location"
                label="Location"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedJobs.map((row) => {
            const duration = formatDuration(row.job.end_date)

            return (
              <TableRow
                key={`${row.ownerName}-${row.job.job_id}`}
                className="border-b border-border/50 hover:bg-surface-tertiary/50"
              >
                {show('owner') && (
                  <TableCell className="py-1.5 w-8">
                    <OwnerIcon
                      ownerId={row.ownerId}
                      ownerType={row.ownerType}
                      size="sm"
                    />
                  </TableCell>
                )}
                {show('activity') && (
                  <TableCell className="py-1.5">{row.activityName}</TableCell>
                )}
                {show('blueprint') && (
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
                )}
                {show('product') && (
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
                )}
                {show('runs') && (
                  <TableCell className="py-1.5 text-right tabular-nums">
                    {row.job.runs.toLocaleString()}
                  </TableCell>
                )}
                {show('value') && (
                  <TableCell className="py-1.5 text-right tabular-nums text-status-positive">
                    {row.productValue > 0
                      ? formatNumber(row.productValue)
                      : '-'}
                  </TableCell>
                )}
                {show('cost') && (
                  <TableCell className="py-1.5 text-right tabular-nums text-status-highlight">
                    {row.job.cost ? formatNumber(row.job.cost) : '-'}
                  </TableCell>
                )}
                {show('time') && (
                  <TableCell
                    className={cn(
                      'py-1.5 text-right tabular-nums',
                      duration.isComplete && 'text-status-positive',
                      !duration.isComplete && 'text-content-secondary'
                    )}
                  >
                    {duration.text}
                  </TableCell>
                )}
                {show('location') && (
                  <TableCell className="py-1.5 text-status-info">
                    {row.locationName}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <Pagination
          page={clampedPage}
          totalPages={totalPages}
          totalItems={sortedJobs.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </>
  )
}

export function IndustryJobsTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const priceVersion = usePriceStore((s) => s.priceVersion)
  const itemsById = useIndustryJobsStore((s) => s.itemsById)
  const visibilityByOwner = useIndustryJobsStore((s) => s.visibilityByOwner)
  const jobsCount = itemsById.size
  const jobsUpdating = useIndustryJobsStore((s) => s.isUpdating)
  const updateError = useIndustryJobsStore((s) => s.updateError)
  const update = useIndustryJobsStore((s) => s.update)
  const initialized = useIndustryJobsStore((s) => s.initialized)

  const jobsByOwner = useMemo(
    () => useIndustryJobsStore.getJobsByOwner({ itemsById, visibilityByOwner }),
    [itemsById, visibilityByOwner]
  )

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || jobsUpdating

  useEffect(() => {
    if (initialized) {
      update()
    }
  }, [initialized, update])

  const types = useReferenceCacheStore((s) => s.types)
  const structures = useReferenceCacheStore((s) => s.structures)

  const { search, setTotalValue, setColumns } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const JOB_COLUMNS: ColumnConfig[] = useMemo(
    () => [
      { id: 'owner', label: 'Owner' },
      { id: 'activity', label: 'Activity' },
      { id: 'blueprint', label: 'Blueprint' },
      { id: 'product', label: 'Product' },
      { id: 'runs', label: 'Runs' },
      { id: 'value', label: 'Value' },
      { id: 'cost', label: 'Cost' },
      { id: 'time', label: 'Time' },
      { id: 'location', label: 'Location' },
    ],
    []
  )

  const { getColumnsForDropdown, getVisibleColumns } = useColumnSettings(
    'industry-jobs',
    JOB_COLUMNS
  )
  const visibleColumns = useMemo(
    () => new Set(getVisibleColumns()),
    [getVisibleColumns]
  )

  const { allJobs, totalValue } = useMemo(() => {
    void types
    void structures
    void priceVersion

    const filteredJobsByOwner = jobsByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.id))
    )

    const jobs: JobRow[] = []
    let value = 0

    for (const { owner, jobs: ownerJobs } of filteredJobsByOwner) {
      for (const job of ownerJobs) {
        const bpType = types.get(job.blueprint_type_id)
        const productType = job.product_type_id
          ? types.get(job.product_type_id)
          : undefined

        const productPrice = job.product_type_id
          ? (getJitaPrice(job.product_type_id) ?? 0)
          : 0
        const productValue = productPrice * job.runs

        jobs.push({
          job,
          ownerId: owner.id,
          ownerType: owner.type,
          ownerName: owner.name,
          blueprintName:
            bpType?.name ?? `Unknown Type ${job.blueprint_type_id}`,
          productName:
            productType?.name ??
            (job.product_type_id ? `Unknown Type ${job.product_type_id}` : ''),
          productCategoryId: productType?.categoryId,
          locationName: getLocationName(job.location_id ?? job.facility_id),
          activityName:
            ACTIVITY_NAMES[job.activity_id] ?? `Activity ${job.activity_id}`,
          productValue,
        })

        value += productValue
      }
    }

    if (search) {
      const searchLower = search.toLowerCase()
      const filtered = jobs.filter((j) =>
        matchesSearchLower(
          searchLower,
          j.blueprintName,
          j.productName,
          j.ownerName,
          j.locationName,
          j.activityName
        )
      )
      return { allJobs: filtered, totalValue: value }
    }

    return { allJobs: jobs, totalValue: value }
  }, [jobsByOwner, types, structures, priceVersion, search, selectedSet])

  useEffect(() => {
    setTotalValue({ value: totalValue })
    return () => setTotalValue(null)
  }, [totalValue, setTotalValue])

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
    <div className={CONTAINER_CLASS}>
      {allJobs.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-content-secondary">No industry jobs.</p>
        </div>
      ) : (
        <JobsTable jobs={allJobs} visibleColumns={visibleColumns} />
      )}
    </div>
  )
}
