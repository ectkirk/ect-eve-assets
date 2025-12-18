import { useMemo } from 'react'
import { Fuel, AlertTriangle, Clock } from 'lucide-react'
import { useSortable, SortableHeader } from '@/hooks'
import { getStateDisplay } from '@/lib/structure-constants'
import {
  formatFuelHours,
  getStarbaseTimer,
  getTimerColorClass,
} from '@/lib/timer-utils'
import { calculateFuelHours } from '@/store/starbase-details-store'
import type { ESIStarbaseDetail } from '@/api/endpoints/starbases'
import type { ESIStarbase } from '@/store/starbases-store'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { TypeIcon } from '@/components/ui/type-icon'
import type { StarbaseRow, StarbaseSortColumn } from './types'

interface StarbaseTableProps {
  rows: StarbaseRow[]
  starbaseDetails: Map<number, ESIStarbaseDetail>
  onViewPosInfo: (starbase: ESIStarbase, ownerName: string) => void
}

export function StarbaseTable({ rows, starbaseDetails, onViewPosInfo }: StarbaseTableProps) {
  const sort = useSortable<StarbaseSortColumn>('region', 'asc')

  const sortedRows = useMemo(() => {
    const getValue = (row: StarbaseRow, column: StarbaseSortColumn): number | string => {
      switch (column) {
        case 'name':
          return (row.moonName ?? `Moon ${row.starbase.moon_id ?? 0}`).toLowerCase()
        case 'type':
          return row.typeName.toLowerCase()
        case 'region':
          return row.regionName.toLowerCase()
        case 'state':
          return row.starbase.state ?? 'unknown'
        case 'fuel': {
          const detail = starbaseDetails.get(row.starbase.starbase_id)
          const hours = calculateFuelHours(detail, row.towerSize, row.fuelTier)
          return hours ?? -1
        }
        case 'details': {
          const timer = getStarbaseTimer(row.starbase)
          if (timer.type === 'reinforced') return timer.timestamp ?? Infinity
          if (timer.type === 'unanchoring') return (timer.timestamp ?? Infinity) + 1e15
          if (timer.type === 'onlining') return 1e16
          return Infinity
        }
        default:
          return 0
      }
    }

    const getMoonName = (row: StarbaseRow) =>
      (row.moonName ?? `Moon ${row.starbase.moon_id ?? 0}`).toLowerCase()

    return [...rows].sort((a, b) => {
      const aVal = getValue(a, sort.sortColumn)
      const bVal = getValue(b, sort.sortColumn)
      const dir = sort.sortDirection === 'asc' ? 1 : -1

      if (aVal < bVal) return -dir
      if (aVal > bVal) return dir

      const aMoon = getMoonName(a)
      const bMoon = getMoonName(b)
      if (aMoon < bMoon) return -1
      if (aMoon > bMoon) return 1
      return 0
    })
  }, [rows, sort.sortColumn, sort.sortDirection, starbaseDetails])

  if (sortedRows.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/30 overflow-hidden flex-shrink-0">
      <div className="px-3 py-2 border-b border-border bg-surface-secondary/50">
        <h3 className="text-sm font-medium text-content-primary">Starbases ({sortedRows.length})</h3>
      </div>
      <Table className="table-fixed">
        <TableHeader className="bg-surface-secondary">
          <TableRow className="hover:bg-transparent">
            <SortableHeader column="name" label="Moon" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={sort.handleSort} className="w-[35%]" />
            <SortableHeader column="type" label="Type" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={sort.handleSort} className="w-[20%]" />
            <SortableHeader column="region" label="Region" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={sort.handleSort} className="w-[15%]" />
            <SortableHeader column="state" label="State" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={sort.handleSort} className="w-[10%]" />
            <SortableHeader column="fuel" label="Fuel" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={sort.handleSort} className="w-[10%] text-right" />
            <SortableHeader column="details" label="Details" sortColumn={sort.sortColumn} sortDirection={sort.sortDirection} onSort={sort.handleSort} className="w-[10%] text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => {
            const state = row.starbase.state ?? 'unknown'
            const stateInfo = getStateDisplay(state)
            const isReinforced = state === 'reinforced'
            const detail = starbaseDetails.get(row.starbase.starbase_id)
            const fuelHours = calculateFuelHours(detail, row.towerSize, row.fuelTier)
            const fuelInfo = formatFuelHours(fuelHours)
            const timerInfo = getStarbaseTimer(row.starbase)

            const moonDisplay = row.moonName
              ?? (row.starbase.moon_id ? `Moon ${row.starbase.moon_id}` : '-')

            const timerColorClass = getTimerColorClass(timerInfo.type, timerInfo.isUrgent)

            const tableRow = (
              <TableRow key={`pos-${row.starbase.starbase_id}`}>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://images.evetech.net/corporations/${row.owner.id}/logo?size=32`}
                      alt=""
                      className="w-5 h-5 rounded"
                    />
                    <span className="truncate" title={moonDisplay}>
                      {moonDisplay}
                    </span>
                    {isReinforced && <AlertTriangle className="h-4 w-4 text-status-negative" />}
                  </div>
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <TypeIcon typeId={row.starbase.type_id} />
                    <span className="text-content-secondary">{row.typeName}</span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-content-secondary">{row.regionName}</TableCell>
                <TableCell className="py-1.5">
                  <span className={stateInfo.color}>{stateInfo.label}</span>
                </TableCell>
                <TableCell className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {fuelInfo.isLow && <Fuel className="h-4 w-4 text-status-negative" />}
                    <span className={cn('tabular-nums', fuelInfo.isLow ? 'text-status-negative' : 'text-content-secondary')}>
                      {fuelInfo.text}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {timerInfo.type !== 'none' && <Clock className="h-3.5 w-3.5" />}
                    <span className={cn('tabular-nums text-sm', timerColorClass)}>
                      {timerInfo.text}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )

            return (
              <ContextMenu key={`pos-${row.starbase.starbase_id}`}>
                <ContextMenuTrigger asChild>{tableRow}</ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => onViewPosInfo(row.starbase, row.ownerName)}>
                    Show POS Info
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
