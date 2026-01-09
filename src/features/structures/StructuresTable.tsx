import { useMemo, useEffect, useState } from 'react'
import { Fuel, AlertTriangle, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSortable, SortableHeader, sortRows } from '@/hooks'
import { getStateDisplay } from '@/lib/structure-constants'
import { getTimerColorClass, type TimerType } from '@/lib/timer-utils'
import type { ESICorporationStructure } from '@/store/structures-store'
import type { ESIStarbase } from '@/store/starbases-store'
import type { ESICustomsOffice } from '@/store/customs-offices-store'
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
import { TypeIcon, CorporationLogo } from '@/components/ui/type-icon'
import { useTabControls } from '@/context'
import type { UnifiedStructureRow, StructureSortColumn } from './types'

const STORAGE_KEY = 'structures-column-visibility'

const COLUMNS: {
  id: StructureSortColumn
  label: string
  align?: 'right'
}[] = [
  { id: 'name', label: 'columns.name' },
  { id: 'type', label: 'columns.type' },
  { id: 'region', label: 'columns.region' },
  { id: 'state', label: 'columns.state' },
  { id: 'fuel', label: 'columns.fuel', align: 'right' },
  { id: 'rigs', label: 'columns.rigs' },
  { id: 'details', label: 'columns.details', align: 'right' },
]

const DEFAULT_VISIBILITY: Record<string, boolean> = Object.fromEntries(
  COLUMNS.map((c) => [c.id, true])
)

function loadColumnVisibility(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_VISIBILITY, ...JSON.parse(stored) }
  } catch {
    return DEFAULT_VISIBILITY
  }
  return DEFAULT_VISIBILITY
}

function saveColumnVisibility(visibility: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility))
  } catch {
    // localStorage may be unavailable
  }
}

interface StructuresTableProps {
  rows: UnifiedStructureRow[]
  onViewStructureInfo: (
    structure: ESICorporationStructure,
    ownerName: string
  ) => void
  onViewPosInfo: (starbase: ESIStarbase, ownerName: string) => void
  onViewPocoInfo: (customsOffice: ESICustomsOffice, ownerName: string) => void
  onViewFitting: (node: TreeNode) => void
}

export function StructuresTable({
  rows,
  onViewStructureInfo,
  onViewPosInfo,
  onViewPocoInfo,
  onViewFitting,
}: StructuresTableProps) {
  const { t } = useTranslation('structures')
  const { sortColumn, sortDirection, handleSort } =
    useSortable<StructureSortColumn>('region', 'asc')
  const [columnVisibility, setColumnVisibility] = useState(loadColumnVisibility)
  const { setColumns } = useTabControls()

  const show = (col: string) => columnVisibility[col] ?? true

  useEffect(() => {
    saveColumnVisibility(columnVisibility)
  }, [columnVisibility])

  useEffect(() => {
    const cols = COLUMNS.map((col) => ({
      id: col.id,
      label: col.label,
      visible: columnVisibility[col.id] ?? true,
      toggle: () =>
        setColumnVisibility((prev) => ({ ...prev, [col.id]: !prev[col.id] })),
    }))
    setColumns(cols)
    return () => setColumns([])
  }, [columnVisibility, setColumns])

  const sortedRows = useMemo(() => {
    return sortRows(rows, sortColumn, sortDirection, (row, column) => {
      switch (column) {
        case 'name':
          return row.name.toLowerCase()
        case 'type':
          return row.typeName.toLowerCase()
        case 'region':
          return row.regionName.toLowerCase()
        case 'state':
          return row.state
        case 'fuel':
          return row.fuelValue ?? -1
        case 'rigs':
          return row.rigs.join(', ').toLowerCase()
        case 'details': {
          if (row.timerType === 'reinforcing' || row.timerType === 'reinforced')
            return row.timerTimestamp ?? Infinity
          if (row.timerType === 'vulnerable')
            return (row.timerTimestamp ?? Infinity) + 1e14
          if (row.timerType === 'unanchoring')
            return (row.timerTimestamp ?? Infinity) + 1e15
          if (row.timerType === 'anchoring' || row.timerType === 'onlining')
            return (row.timerTimestamp ?? Infinity) + 1e16
          return Infinity
        }
        default:
          return 0
      }
    })
  }, [rows, sortColumn, sortDirection])

  if (sortedRows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-content-secondary">{t('noStructures')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            <TableRow className="hover:bg-transparent border-b border-border">
              {COLUMNS.filter((col) => show(col.id)).map((col) => (
                <SortableHeader
                  key={col.id}
                  column={col.id}
                  label={col.label}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  className={col.align === 'right' ? 'text-right' : ''}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <StructureRowWithContext
                key={row.id}
                row={row}
                show={show}
                onViewStructureInfo={onViewStructureInfo}
                onViewPosInfo={onViewPosInfo}
                onViewPocoInfo={onViewPocoInfo}
                onViewFitting={onViewFitting}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

interface StructureRowProps {
  row: UnifiedStructureRow
  show: (col: string) => boolean
  onViewStructureInfo: (
    structure: ESICorporationStructure,
    ownerName: string
  ) => void
  onViewPosInfo: (starbase: ESIStarbase, ownerName: string) => void
  onViewPocoInfo: (customsOffice: ESICustomsOffice, ownerName: string) => void
  onViewFitting: (node: TreeNode) => void
}

function StructureRowWithContext({
  row,
  show,
  onViewStructureInfo,
  onViewPosInfo,
  onViewPocoInfo,
  onViewFitting,
}: StructureRowProps) {
  const { t } = useTranslation('common')
  const stateInfo = getStateDisplay(row.state)
  const timerColorClass = getTimerColorClass(
    row.timerType as TimerType,
    row.timerIsUrgent
  )
  const hasFitting = row.treeNode != null

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow className="border-b border-border/50 hover:bg-surface-tertiary/50">
          {show('name') && (
            <TableCell className="py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <CorporationLogo
                  corporationId={row.owner.id}
                  size="sm"
                  className="shrink-0"
                />
                <span className="truncate" title={row.name}>
                  {row.name}
                </span>
                {row.isReinforced && (
                  <AlertTriangle className="h-4 w-4 text-status-negative shrink-0" />
                )}
              </div>
            </TableCell>
          )}
          {show('type') && (
            <TableCell className="py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <TypeIcon typeId={row.typeId} />
                <span className="text-content-secondary truncate">
                  {row.typeName}
                </span>
              </div>
            </TableCell>
          )}
          {show('region') && (
            <TableCell className="py-1.5 text-content-secondary">
              {row.regionName}
            </TableCell>
          )}
          {show('state') && (
            <TableCell className="py-1.5">
              <span className={stateInfo.color}>{stateInfo.label}</span>
            </TableCell>
          )}
          {show('fuel') && (
            <TableCell className="py-1.5 text-right">
              <div className="flex items-center justify-end gap-1">
                {row.fuelIsLow && (
                  <Fuel className="h-4 w-4 text-status-negative" />
                )}
                <span
                  className={cn(
                    'tabular-nums',
                    row.fuelIsLow
                      ? 'text-status-negative'
                      : 'text-content-secondary'
                  )}
                >
                  {row.fuelText}
                </span>
              </div>
            </TableCell>
          )}
          {show('rigs') && (
            <TableCell className="py-1.5">
              <span
                className="text-content-secondary truncate block"
                title={row.rigs.join(', ')}
              >
                {row.rigs.length > 0 ? row.rigs.join(', ') : '—'}
              </span>
            </TableCell>
          )}
          {show('details') && (
            <TableCell className="py-1.5 text-right">
              <div className="flex items-center justify-end gap-1">
                {row.timerType !== 'none' && <Clock className="h-3.5 w-3.5" />}
                <span className={cn('tabular-nums text-sm', timerColorClass)}>
                  {row.timerText}
                </span>
              </div>
            </TableCell>
          )}
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {row.kind === 'upwell' && row.structure && (
          <ContextMenuItem
            onClick={() => onViewStructureInfo(row.structure!, row.owner.name)}
          >
            {t('contextMenu.showStructureInfo')}
          </ContextMenuItem>
        )}
        {row.kind === 'pos' && row.starbase && (
          <ContextMenuItem
            onClick={() => onViewPosInfo(row.starbase!, row.owner.name)}
          >
            {t('contextMenu.showPosInfo')}
          </ContextMenuItem>
        )}
        {row.kind === 'poco' && row.customsOffice && (
          <ContextMenuItem
            onClick={() => onViewPocoInfo(row.customsOffice!, row.owner.name)}
          >
            {t('contextMenu.showPocoInfo')}
          </ContextMenuItem>
        )}
        {hasFitting && (
          <ContextMenuItem onClick={() => onViewFitting(row.treeNode!)}>
            {t('contextMenu.viewFitting')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
