import { useMemo } from 'react'
import { Fuel, AlertTriangle, Clock } from 'lucide-react'
import { useSortable, SortableHeader } from '@/hooks'
import { getStateDisplay } from '@/lib/structure-constants'
import {
  formatFuelExpiry,
  getStructureTimer,
  getTimerColorClass,
} from '@/lib/timer-utils'
import { extractFitting } from '@/lib/fitting-utils'
import type { ESICorporationStructure } from '@/store/structures-store'
import type { TreeNode } from '@/lib/tree-types'
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
import type { StructureRow, UpwellSortColumn } from './types'

function getRigNames(treeNode: TreeNode | null): string[] {
  if (!treeNode) return []
  const fitting = extractFitting(treeNode)
  return fitting.rigModules.filter((m) => m.type_id > 0).map((m) => m.type_name)
}

interface UpwellTableProps {
  rows: StructureRow[]
  onViewStructureInfo: (
    structure: ESICorporationStructure,
    ownerName: string
  ) => void
  onViewFitting: (node: TreeNode) => void
}

export function UpwellTable({
  rows,
  onViewStructureInfo,
  onViewFitting,
}: UpwellTableProps) {
  const sort = useSortable<UpwellSortColumn>('region', 'asc')

  const sortedRows = useMemo(() => {
    const getValue = (
      row: StructureRow,
      column: UpwellSortColumn
    ): number | string => {
      switch (column) {
        case 'name':
          return (row.structure.name ?? '').toLowerCase()
        case 'type':
          return row.typeName.toLowerCase()
        case 'region':
          return row.regionName.toLowerCase()
        case 'state':
          return row.structure.state
        case 'fuel':
          return row.fuelDays ?? -1
        case 'rigs':
          return getRigNames(row.treeNode).join(', ').toLowerCase()
        case 'details': {
          const timer = getStructureTimer(row.structure)
          if (timer.type === 'reinforcing') return timer.timestamp ?? Infinity
          if (timer.type === 'vulnerable')
            return (timer.timestamp ?? Infinity) + 1e14
          if (timer.type === 'unanchoring')
            return (timer.timestamp ?? Infinity) + 1e15
          if (timer.type === 'anchoring')
            return (timer.timestamp ?? Infinity) + 1e16
          return Infinity
        }
        default:
          return 0
      }
    }

    const getName = (row: StructureRow) =>
      (row.structure.name ?? '').toLowerCase()

    return [...rows].sort((a, b) => {
      const aVal = getValue(a, sort.sortColumn)
      const bVal = getValue(b, sort.sortColumn)
      const dir = sort.sortDirection === 'asc' ? 1 : -1

      if (aVal < bVal) return -dir
      if (aVal > bVal) return dir

      const aName = getName(a)
      const bName = getName(b)
      if (aName < bName) return -1
      if (aName > bName) return 1
      return 0
    })
  }, [rows, sort.sortColumn, sort.sortDirection])

  if (sortedRows.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/30 overflow-hidden flex-shrink-0">
      <div className="px-3 py-2 border-b border-border bg-surface-secondary/50">
        <h3 className="text-sm font-medium text-content-primary">
          Upwell Structures ({sortedRows.length})
        </h3>
      </div>
      <Table className="table-fixed">
        <TableHeader className="bg-surface-secondary">
          <TableRow className="hover:bg-transparent">
            <SortableHeader
              column="name"
              label="Structure"
              sortColumn={sort.sortColumn}
              sortDirection={sort.sortDirection}
              onSort={sort.handleSort}
              className="w-[22%]"
            />
            <SortableHeader
              column="type"
              label="Type"
              sortColumn={sort.sortColumn}
              sortDirection={sort.sortDirection}
              onSort={sort.handleSort}
              className="w-[15%]"
            />
            <SortableHeader
              column="region"
              label="Region"
              sortColumn={sort.sortColumn}
              sortDirection={sort.sortDirection}
              onSort={sort.handleSort}
              className="w-[12%]"
            />
            <SortableHeader
              column="state"
              label="State"
              sortColumn={sort.sortColumn}
              sortDirection={sort.sortDirection}
              onSort={sort.handleSort}
              className="w-[10%]"
            />
            <SortableHeader
              column="fuel"
              label="Fuel"
              sortColumn={sort.sortColumn}
              sortDirection={sort.sortDirection}
              onSort={sort.handleSort}
              className="w-[8%] text-right"
            />
            <SortableHeader
              column="rigs"
              label="Rigs"
              sortColumn={sort.sortColumn}
              sortDirection={sort.sortDirection}
              onSort={sort.handleSort}
              className="w-[23%]"
            />
            <SortableHeader
              column="details"
              label="Details"
              sortColumn={sort.sortColumn}
              sortDirection={sort.sortDirection}
              onSort={sort.handleSort}
              className="w-[10%] text-right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => {
            const stateInfo = getStateDisplay(row.structure.state)
            const fuelInfo = formatFuelExpiry(row.structure.fuel_expires)
            const isReinforced = row.structure.state.includes('reinforce')
            const hasFitting = row.treeNode !== null
            const timerInfo = getStructureTimer(row.structure)
            const rigNames = getRigNames(row.treeNode)

            const timerColorClass = getTimerColorClass(
              timerInfo.type,
              timerInfo.isUrgent
            )

            const tableRow = (
              <TableRow key={`upwell-${row.structure.structure_id}`}>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <img
                      src={`https://images.evetech.net/corporations/${row.owner.id}/logo?size=32`}
                      alt=""
                      className="w-5 h-5 rounded"
                    />
                    <span className="truncate" title={row.structure.name}>
                      {row.structure.name ||
                        `Structure ${row.structure.structure_id}`}
                    </span>
                    {isReinforced && (
                      <AlertTriangle className="h-4 w-4 text-status-negative" />
                    )}
                  </div>
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <TypeIcon typeId={row.structure.type_id} />
                    <span className="text-content-secondary">
                      {row.typeName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-content-secondary">
                  {row.regionName}
                </TableCell>
                <TableCell className="py-1.5">
                  <span className={stateInfo.color}>{stateInfo.label}</span>
                </TableCell>
                <TableCell className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {fuelInfo.isLow && (
                      <Fuel className="h-4 w-4 text-status-negative" />
                    )}
                    <span
                      className={cn(
                        'tabular-nums',
                        fuelInfo.isLow
                          ? 'text-status-negative'
                          : 'text-content-secondary'
                      )}
                    >
                      {fuelInfo.text}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5">
                  <span
                    className="text-content-secondary truncate block"
                    title={rigNames.join(', ')}
                  >
                    {rigNames.length > 0 ? rigNames.join(', ') : '—'}
                  </span>
                </TableCell>
                <TableCell className="py-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {timerInfo.type !== 'none' && (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    <span
                      className={cn('tabular-nums text-sm', timerColorClass)}
                    >
                      {timerInfo.text}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )

            return (
              <ContextMenu key={`upwell-${row.structure.structure_id}`}>
                <ContextMenuTrigger asChild>{tableRow}</ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() =>
                      onViewStructureInfo(row.structure, row.owner.name)
                    }
                  >
                    Show Structure Info
                  </ContextMenuItem>
                  {hasFitting && (
                    <ContextMenuItem
                      onClick={() => onViewFitting(row.treeNode!)}
                    >
                      View Fitting
                    </ContextMenuItem>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
