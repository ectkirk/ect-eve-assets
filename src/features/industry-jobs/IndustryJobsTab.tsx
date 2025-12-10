import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Loader2,
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
import { type ESIIndustryJob } from '@/api/endpoints/industry'
import {
  hasType,
  getType,
  hasLocation,
  getLocation,
  hasStructure,
  getStructure,
  subscribe,
} from '@/store/reference-cache'
import { resolveTypes, resolveLocations } from '@/api/ref-client'
import { resolveStructures } from '@/api/endpoints/universe'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { TypeIcon } from '@/components/ui/type-icon'

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
}

function formatISK(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B'
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M'
  if (value >= 1_000) return (value / 1_000).toFixed(2) + 'K'
  return value.toLocaleString()
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
      return <Clock className="h-4 w-4 text-blue-400" />
    case 'ready':
      return <CheckCircle2 className="h-4 w-4 text-green-400" />
    case 'delivered':
      return <CheckCircle2 className="h-4 w-4 text-slate-500" />
    case 'cancelled':
    case 'reverted':
      return <XCircle className="h-4 w-4 text-red-400" />
    case 'paused':
      return <PauseCircle className="h-4 w-4 text-yellow-400" />
    default:
      return <Clock className="h-4 w-4 text-slate-400" />
  }
}

function JobsTable({ jobs }: { jobs: JobRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-8"></TableHead>
          <TableHead>Activity</TableHead>
          <TableHead>Blueprint</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="text-right">Runs</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Time</TableHead>
          <TableHead>Owner</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((row) => {
          const ActivityIcon = ACTIVITY_ICONS[row.job.activity_id] ?? Hammer
          const duration = formatDuration(row.job.end_date)

          return (
            <TableRow key={`${row.ownerName}-${row.job.job_id}`}>
              <TableCell className="py-1.5 w-8">
                <StatusIcon status={row.job.status} />
              </TableCell>
              <TableCell className="py-1.5">
                <div className="flex items-center gap-2">
                  <ActivityIcon className="h-4 w-4 text-slate-400" />
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
                  <span className="text-slate-500">-</span>
                )}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums">
                {row.job.runs.toLocaleString()}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums text-green-400">
                {row.productValue > 0 ? formatISK(row.productValue) : '-'}
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums text-amber-400">
                {row.job.cost ? formatISK(row.job.cost) : '-'}
              </TableCell>
              <TableCell
                className={cn(
                  'py-1.5 text-right tabular-nums',
                  duration.isComplete && 'text-green-400',
                  !duration.isComplete && 'text-slate-400'
                )}
              >
                {duration.text}
              </TableCell>
              <TableCell className="py-1.5 text-slate-400">{row.ownerName}</TableCell>
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
        <span className="font-medium text-blue-300 flex-1">{group.locationName}</span>
        <span className="text-xs text-blue-400 w-20 text-right">
          {group.activeCount > 0 && `${group.activeCount} active`}
        </span>
        <span className="text-xs text-slate-500 w-24 text-right">
          {group.completedCount > 0 && `${group.completedCount} completed`}
        </span>
      </button>
      {isExpanded && (
        <div className="bg-slate-900/30 px-3 pb-2">
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
  const jobsByOwner = useIndustryJobsStore((s) => s.jobsByOwner)
  const jobsLastUpdated = useIndustryJobsStore((s) => s.lastUpdated)
  const jobsUpdating = useIndustryJobsStore((s) => s.isUpdating)
  const updateError = useIndustryJobsStore((s) => s.updateError)
  const init = useIndustryJobsStore((s) => s.init)
  const initialized = useIndustryJobsStore((s) => s.initialized)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || jobsUpdating

  useEffect(() => {
    init()
  }, [init])

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => subscribe(() => setCacheVersion((v) => v + 1)), [])

  useEffect(() => {
    if (jobsByOwner.length === 0) return

    const unresolvedTypeIds = new Set<number>()
    const unknownLocationIds = new Set<number>()
    const structureToCharacter = new Map<number, number>()

    for (const { owner, jobs } of jobsByOwner) {
      for (const job of jobs) {
        const bpType = getType(job.blueprint_type_id)
        if (!bpType || bpType.name.startsWith('Unknown Type ')) {
          unresolvedTypeIds.add(job.blueprint_type_id)
        }
        if (job.product_type_id) {
          const productType = getType(job.product_type_id)
          if (!productType || productType.name.startsWith('Unknown Type ')) {
            unresolvedTypeIds.add(job.product_type_id)
          }
        }
        if (job.facility_id > 1_000_000_000_000) {
          if (!hasStructure(job.facility_id)) {
            structureToCharacter.set(job.facility_id, owner.characterId)
          }
        } else if (!hasLocation(job.facility_id)) {
          unknownLocationIds.add(job.facility_id)
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
  }, [jobsByOwner])

  const [expandedLocations, setExpandedLocations] = useState<Set<number>>(new Set())

  const { setExpandCollapse, search } = useTabControls()
  const activeOwnerId = useAuthStore((s) => s.activeOwnerId)

  const locationGroups = useMemo(() => {
    void cacheVersion

    const getLocationName = (locationId: number): string => {
      if (locationId > 1_000_000_000_000) {
        const structure = hasStructure(locationId) ? getStructure(locationId) : undefined
        return structure?.name ?? `Structure ${locationId}`
      }
      const location = hasLocation(locationId) ? getLocation(locationId) : undefined
      return location?.name ?? `Location ${locationId}`
    }

    const groups = new Map<number, LocationGroup>()

    const filteredJobsByOwner = activeOwnerId === null
      ? jobsByOwner
      : jobsByOwner.filter(({ owner }) => ownerKey(owner.type, owner.characterId) === activeOwnerId)

    for (const { owner, jobs } of filteredJobsByOwner) {
      for (const job of jobs) {
        const bpType = hasType(job.blueprint_type_id) ? getType(job.blueprint_type_id) : undefined
        const productType =
          job.product_type_id && hasType(job.product_type_id)
            ? getType(job.product_type_id)
            : undefined

        const productPrice = job.product_type_id ? (prices.get(job.product_type_id) ?? 0) : 0
        const productValue = productPrice * job.runs

        const row: JobRow = {
          job,
          ownerName: owner.name,
          blueprintName: bpType?.name ?? `Unknown Type ${job.blueprint_type_id}`,
          productName: productType?.name ?? (job.product_type_id ? `Unknown Type ${job.product_type_id}` : ''),
          productCategoryId: productType?.categoryId,
          locationName: getLocationName(job.facility_id),
          activityName: ACTIVITY_NAMES[job.activity_id] ?? `Activity ${job.activity_id}`,
          productValue,
        }

        let group = groups.get(job.facility_id)
        if (!group) {
          group = {
            locationId: job.facility_id,
            locationName: row.locationName,
            jobs: [],
            activeCount: 0,
            completedCount: 0,
          }
          groups.set(job.facility_id, group)
        }

        group.jobs.push(row)
        if (job.status === 'active' || job.status === 'paused') {
          group.activeCount++
        } else {
          group.completedCount++
        }
      }
    }

    let sorted = Array.from(groups.values()).sort((a, b) => {
      if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount
      return a.locationName.localeCompare(b.locationName)
    })

    for (const group of sorted) {
      group.jobs.sort((a, b) => {
        const statusOrder = { active: 0, ready: 1, paused: 2, delivered: 3, cancelled: 4, reverted: 5 }
        const aOrder = statusOrder[a.job.status] ?? 99
        const bOrder = statusOrder[b.job.status] ?? 99
        if (aOrder !== bOrder) return aOrder - bOrder
        return new Date(a.job.end_date).getTime() - new Date(b.job.end_date).getTime()
      })
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
  }, [jobsByOwner, cacheVersion, prices, search, activeOwnerId])

  const toggleLocation = useCallback((locationId: number) => {
    setExpandedLocations((prev) => {
      const next = new Set(prev)
      if (next.has(locationId)) next.delete(locationId)
      else next.add(locationId)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allIds = locationGroups.map((g) => g.locationId)
    setExpandedLocations(new Set(allIds))
  }, [locationGroups])

  const collapseAll = useCallback(() => {
    setExpandedLocations(new Set())
  }, [])

  const expandableIds = useMemo(() => locationGroups.map((g) => g.locationId), [locationGroups])
  const isAllExpanded = expandableIds.length > 0 && expandableIds.every((id) => expandedLocations.has(id))

  useEffect(() => {
    if (expandableIds.length === 0) {
      setExpandCollapse(null)
      return
    }

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
  }, [expandableIds, isAllExpanded, expandAll, collapseAll, setExpandCollapse])

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

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No characters logged in. Add a character to view jobs.</p>
      </div>
    )
  }

  if (!initialized || (isUpdating && jobsByOwner.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">Loading industry jobs...</p>
        </div>
      </div>
    )
  }

  if (jobsByOwner.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {updateError && (
            <>
              <p className="text-red-500">Failed to load industry jobs</p>
              <p className="text-sm text-slate-400 mb-4">{updateError}</p>
            </>
          )}
          {!updateError && (
            <p className="text-slate-400">No industry jobs loaded. Use the Update button in the header to fetch from ESI.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-slate-400">Active: </span>
          <span className="font-medium text-blue-400">{totals.activeCount}</span>
        </div>
        <div>
          <span className="text-slate-400">Completed: </span>
          <span className="font-medium text-slate-500">{totals.completedCount}</span>
        </div>
        <div>
          <span className="text-slate-400">Total Cost: </span>
          <span className="font-medium text-amber-400">{formatISK(totals.totalCost)}</span>
        </div>
      </div>

      <div
        className="rounded-lg border border-slate-700 overflow-auto"
        style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}
      >
        {locationGroups.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-400">No industry jobs.</p>
          </div>
        ) : (
          locationGroups.map((group) => (
            <LocationGroupRow
              key={group.locationId}
              group={group}
              isExpanded={expandedLocations.has(group.locationId)}
              onToggle={() => toggleLocation(group.locationId)}
            />
          ))
        )}
      </div>

      {jobsLastUpdated && (
        <p className="text-xs text-slate-500 text-right">
          Last updated: {new Date(jobsLastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  )
}
