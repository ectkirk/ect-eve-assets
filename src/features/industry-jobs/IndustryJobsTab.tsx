import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useReferenceCacheStore, getTypeName } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatNumber, formatFullNumber } from '@/lib/utils'
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

const ACTIVITY_IDS: Record<number, string> = {
  1: 'manufacturing',
  3: 'teResearch',
  4: 'meResearch',
  5: 'copying',
  7: 'reverseEngineering',
  8: 'invention',
  9: 'reactions',
  11: 'reactions',
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

interface DurationResult {
  isComplete: boolean
  days?: number
  hours?: number
  minutes?: number
}

function getDuration(endDate: string): DurationResult {
  const end = new Date(endDate).getTime()
  const now = Date.now()
  const remaining = end - now

  if (remaining <= 0) {
    return { isComplete: true }
  }

  const hours = Math.floor(remaining / (60 * 60 * 1000))
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const h = hours % 24
    return { isComplete: false, days, hours: h }
  }

  return { isComplete: false, hours, minutes }
}

function getEndTime(endDate: string): number {
  return new Date(endDate).getTime()
}

interface JobsTableProps {
  jobs: JobRow[]
  visibleColumns: Set<string>
}

function JobsTable({ jobs, visibleColumns }: JobsTableProps) {
  const { t: tc } = useTranslation('common')
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
                label="columns.activity"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('blueprint') && (
              <SortableHeader
                column="blueprint"
                label="columns.blueprint"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('product') && (
              <SortableHeader
                column="product"
                label="columns.product"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
            {show('runs') && (
              <SortableHeader
                column="runs"
                label="columns.runs"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('value') && (
              <SortableHeader
                column="value"
                label="columns.value"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('cost') && (
              <SortableHeader
                column="cost"
                label="columns.cost"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('time') && (
              <SortableHeader
                column="time"
                label="columns.time"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            )}
            {show('location') && (
              <SortableHeader
                column="location"
                label="columns.location"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedJobs.map((row) => {
            const duration = getDuration(row.job.end_date)
            const durationText = duration.isComplete
              ? tc('time.ready')
              : duration.days !== undefined
                ? tc('time.daysHours', {
                    days: duration.days,
                    hours: duration.hours,
                  })
                : tc('time.hoursMinutes', {
                    hours: duration.hours,
                    minutes: duration.minutes,
                  })

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
                    {formatFullNumber(row.job.runs)}
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
                    {durationText}
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
  const { t } = useTranslation('industry')
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
      { id: 'owner', label: 'columns.owner' },
      { id: 'activity', label: 'columns.activity' },
      { id: 'blueprint', label: 'columns.blueprint' },
      { id: 'product', label: 'columns.product' },
      { id: 'runs', label: 'columns.runs' },
      { id: 'value', label: 'columns.value' },
      { id: 'cost', label: 'columns.cost' },
      { id: 'time', label: 'columns.time' },
      { id: 'location', label: 'columns.location' },
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
          blueprintName: getTypeName(job.blueprint_type_id),
          productName: job.product_type_id
            ? getTypeName(job.product_type_id)
            : '',
          productCategoryId: productType?.categoryId,
          locationName: getLocationName(job.location_id ?? job.facility_id),
          activityName: ACTIVITY_IDS[job.activity_id]
            ? t(`activities.${ACTIVITY_IDS[job.activity_id]}`)
            : t('activities.unknown', { id: job.activity_id }),
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
  }, [jobsByOwner, types, structures, priceVersion, search, selectedSet, t])

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
          <p className="text-content-secondary">{t('empty')}</p>
        </div>
      ) : (
        <JobsTable jobs={allJobs} visibleColumns={visibleColumns} />
      )}
    </div>
  )
}
