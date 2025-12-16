import { useMemo, useRef, useCallback, useState, useEffect, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronRight,
  ChevronDown,
  Globe,
  Sun,
  Building2,
  Package,
  Rocket,
  Box,
  Briefcase,
  Layers,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSortable, SortableHeader, type SortDirection } from '@/hooks'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { TreeNode, TreeNodeType } from '@/lib/tree-types'
import { flattenTree, getAllNodeIds } from '@/lib/tree-builder'
import { cn } from '@/lib/utils'
import { TypeIcon } from '@/components/ui/type-icon'
import { useTabControls } from '@/context'
import { useColumnSettings, type ColumnConfig } from '@/hooks'
import { FittingDialog } from '@/components/dialogs/FittingDialog'

type TreeSortColumn = 'name' | 'region' | 'quantity' | 'value' | 'volume'

function sortTreeNodes(
  nodes: TreeNode[],
  sortColumn: TreeSortColumn,
  sortDirection: SortDirection,
  parentRegionName?: string
): TreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    let aVal: number | string
    let bVal: number | string

    const aRegion = a.regionName ?? parentRegionName ?? ''
    const bRegion = b.regionName ?? parentRegionName ?? ''

    switch (sortColumn) {
      case 'name':
        aVal = a.name.toLowerCase()
        bVal = b.name.toLowerCase()
        break
      case 'region':
        aVal = aRegion.toLowerCase()
        bVal = bRegion.toLowerCase()
        break
      case 'quantity':
        aVal = a.totalCount
        bVal = b.totalCount
        break
      case 'value':
        aVal = a.totalValue
        bVal = b.totalValue
        break
      case 'volume':
        aVal = a.totalVolume
        bVal = b.totalVolume
        break
      default:
        return 0
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  return sorted.map((node) => {
    const nodeRegion = node.regionName ?? parentRegionName
    return {
      ...node,
      regionName: nodeRegion,
      children: sortTreeNodes(node.children, sortColumn, sortDirection, nodeRegion),
    }
  })
}

interface TreeTableProps {
  nodes: TreeNode[]
  expandedNodes: Set<string>
  onToggleExpand: (nodeId: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  storageKey?: string
}

function formatNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + 'B'
  }
  if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + 'M'
  }
  if (value >= 1_000) {
    return (value / 1_000).toFixed(2) + 'K'
  }
  return value.toLocaleString()
}

function formatVolume(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' m³'
}

const NODE_TYPE_ICONS: Record<TreeNodeType, React.ElementType> = {
  region: Globe,
  system: Sun,
  station: Building2,
  office: Briefcase,
  division: Layers,
  container: Package,
  ship: Rocket,
  item: Box,
  stack: Box,
}

const NODE_TYPE_COLORS: Record<TreeNodeType, string> = {
  region: 'text-accent',
  system: 'text-status-highlight',
  station: 'text-status-info',
  office: 'text-status-highlight',
  division: 'text-content-secondary',
  container: 'text-status-warning',
  ship: 'text-status-special',
  item: 'text-content-secondary',
  stack: 'text-content-secondary',
}

const DIVISION_COLORS = [
  'text-status-negative',
  'text-status-warning',
  'text-status-highlight',
  'text-status-positive',
  'text-status-positive',
  'text-status-special',
  'text-accent',
]

const TreeNodeIcon = memo(function TreeNodeIcon({
  nodeType,
  divisionNumber,
}: {
  nodeType: TreeNodeType
  divisionNumber?: number
}) {
  const Icon = NODE_TYPE_ICONS[nodeType]
  let colorClass = NODE_TYPE_COLORS[nodeType]
  if (nodeType === 'division' && divisionNumber !== undefined && divisionNumber >= 1 && divisionNumber <= 7) {
    colorClass = DIVISION_COLORS[divisionNumber - 1]!
  }
  return <Icon className={cn('h-4 w-4 flex-shrink-0', colorClass)} />
})

const ItemIcon = memo(function ItemIcon({ node }: { node: TreeNode }) {
  if (!node.typeId) {
    return <TreeNodeIcon nodeType={node.nodeType} divisionNumber={node.divisionNumber} />
  }

  return (
    <TypeIcon
      typeId={node.typeId}
      categoryId={node.categoryId}
      isBlueprintCopy={node.isBlueprintCopy}
    />
  )
})

const TREE_COLUMNS: ColumnConfig[] = [
  { id: 'name', label: 'Name' },
  { id: 'region', label: 'Region' },
  { id: 'quantity', label: 'Quantity' },
  { id: 'value', label: 'Value' },
  { id: 'volume', label: 'Volume', defaultVisible: false },
]

interface TreeRowContentProps {
  node: TreeNode
  isExpanded: boolean
  onToggleExpand: (nodeId: string) => void
  visibleColumns: string[]
}

const TreeRowContent = memo(function TreeRowContent({
  node,
  isExpanded,
  onToggleExpand,
  visibleColumns,
}: TreeRowContentProps) {
  const hasChildren = node.children.length > 0
  const indentPx = node.depth * 20

  const isAssetNode = node.nodeType === 'item' || node.nodeType === 'stack' ||
    node.nodeType === 'ship' || node.nodeType === 'container'
  const isLocationNode = node.nodeType === 'region' || node.nodeType === 'system' ||
    node.nodeType === 'station'
  const isOfficeNode = node.nodeType === 'office'
  const isDivisionNode = node.nodeType === 'division'

  const handleToggleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleExpand(node.id)
  }, [onToggleExpand, node.id])

  return (
    <>
      {visibleColumns.map((colId) => {
        if (colId === 'name') {
          return (
            <TableCell key={colId} className="py-1.5">
              <div
                className="flex items-center gap-1"
                style={{ paddingLeft: `${indentPx}px` }}
              >
                {hasChildren ? (
                  <button
                    onClick={handleToggleClick}
                    className="p-0.5 hover:bg-surface-tertiary rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-content-secondary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-content-secondary" />
                    )}
                  </button>
                ) : (
                  <span className="w-5" />
                )}

                {isAssetNode ? (
                  <ItemIcon node={node} />
                ) : (
                  <TreeNodeIcon nodeType={node.nodeType} divisionNumber={node.divisionNumber} />
                )}

                <span
                  className={cn(
                    'truncate',
                    isLocationNode && node.nodeType === 'region' && 'font-semibold text-accent',
                    isLocationNode && node.nodeType === 'system' && 'font-medium text-status-highlight',
                    isLocationNode && node.nodeType === 'station' && 'text-status-info',
                    isOfficeNode && 'font-medium',
                    isDivisionNode && node.divisionNumber && DIVISION_COLORS[node.divisionNumber - 1],
                    node.isBlueprintCopy && 'text-status-special'
                  )}
                  title={node.name}
                >
                  {isOfficeNode ? (
                    <>
                      <span className="text-status-highlight">{node.name}</span>
                      <span className="text-content-muted italic ml-1">Office</span>
                    </>
                  ) : node.name}
                </span>
                {node.isInContract && (
                  <span className="text-xs text-status-corp bg-semantic-warning/20 px-1.5 py-0.5 rounded ml-2">In Contract</span>
                )}
                {node.isInMarketOrder && (
                  <span className="text-xs text-status-info bg-accent/20 px-1.5 py-0.5 rounded ml-2">Sell Order</span>
                )}
              </div>
            </TableCell>
          )
        }
        if (colId === 'region') {
          return (
            <TableCell key={colId} className="py-1.5 text-content-secondary w-40">
              {node.nodeType !== 'region' && node.regionName ? node.regionName : '-'}
            </TableCell>
          )
        }
        if (colId === 'quantity') {
          return (
            <TableCell key={colId} className="py-1.5 text-right tabular-nums w-24">
              {node.totalCount > 0 ? node.totalCount.toLocaleString() : '-'}
            </TableCell>
          )
        }
        if (colId === 'value') {
          return (
            <TableCell key={colId} className="py-1.5 text-right tabular-nums text-status-positive w-32">
              {node.totalValue > 0 ? formatNumber(node.totalValue) + ' ISK' : '-'}
            </TableCell>
          )
        }
        if (colId === 'volume') {
          return (
            <TableCell key={colId} className="py-1.5 text-right tabular-nums text-content-secondary w-32">
              {node.nodeType !== 'region' && node.nodeType !== 'system' && node.totalVolume > 0
                ? formatVolume(node.totalVolume)
                : '-'}
            </TableCell>
          )
        }
        return null
      })}
    </>
  )
})

interface TreeRowProps {
  node: TreeNode
  virtualIndex: number
  isExpanded: boolean
  onToggleExpand: (nodeId: string) => void
  onViewFitting: (node: TreeNode) => void
  visibleColumns: string[]
}

const TreeRow = memo(function TreeRow({
  node,
  virtualIndex,
  isExpanded,
  onToggleExpand,
  onViewFitting,
  visibleColumns,
}: TreeRowProps) {
  const handleRowClick = useCallback(() => {
    if (node.children.length > 0) {
      onToggleExpand(node.id)
    }
  }, [node.children.length, node.id, onToggleExpand])

  const handleContextMenuClick = useCallback(() => {
    onViewFitting(node)
  }, [node, onViewFitting])

  const isShip = node.nodeType === 'ship'

  const row = (
    <TableRow
      key={node.id}
      data-index={virtualIndex}
      className={cn(
        node.nodeType === 'region' && 'bg-surface-secondary/30',
        node.nodeType === 'system' && 'bg-surface-secondary/20',
        node.isInContract && 'bg-row-contract',
        node.isInMarketOrder && 'bg-row-order'
      )}
      onClick={handleRowClick}
    >
      <TreeRowContent
        node={node}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        visibleColumns={visibleColumns}
      />
    </TableRow>
  )

  if (isShip) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {row}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={handleContextMenuClick}>
            View Fitting
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return row
})

const COLUMN_WIDTHS: Record<string, string> = {
  name: 'w-auto',
  region: 'w-40',
  quantity: 'w-24',
  value: 'w-32',
  volume: 'w-32',
}

const COLUMN_ALIGN: Record<string, string> = {
  name: 'text-left',
  region: 'text-left',
  quantity: 'text-right',
  value: 'text-right',
  volume: 'text-right',
}

export function TreeTable({
  nodes,
  expandedNodes,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  storageKey = 'tree-table',
}: TreeTableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null)

  const {
    getVisibleColumns,
    getColumnsForDropdown,
  } = useColumnSettings(storageKey, TREE_COLUMNS)

  const visibleColumns = getVisibleColumns()

  const { sortColumn, sortDirection, handleSort } = useSortable<TreeSortColumn>('value', 'desc')

  const sortedNodes = useMemo(
    () => sortTreeNodes(nodes, sortColumn, sortDirection),
    [nodes, sortColumn, sortDirection]
  )

  const flatRows = useMemo(
    () => flattenTree(sortedNodes, expandedNodes),
    [sortedNodes, expandedNodes]
  )

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 15,
  })

  const allNodeIds = useMemo(() => getAllNodeIds(sortedNodes), [sortedNodes])
  const hasExpandableNodes = allNodeIds.length > 0
  const isAllExpanded = hasExpandableNodes && allNodeIds.every((id) => expandedNodes.has(id))

  const { setExpandCollapse, setColumns } = useTabControls()

  useEffect(() => {
    setColumns(getColumnsForDropdown())
    return () => setColumns([])
  }, [getColumnsForDropdown, setColumns])

  useEffect(() => {
    if (!hasExpandableNodes) {
      setExpandCollapse(null)
      return
    }

    setExpandCollapse({
      isExpanded: isAllExpanded,
      toggle: () => {
        if (isAllExpanded) {
          onCollapseAll()
        } else {
          onExpandAll()
        }
      },
    })

    return () => setExpandCollapse(null)
  }, [hasExpandableNodes, isAllExpanded, onExpandAll, onCollapseAll, setExpandCollapse])

  const [fittingDialogOpen, setFittingDialogOpen] = useState(false)
  const [selectedShipNode, setSelectedShipNode] = useState<TreeNode | null>(null)

  const handleViewFitting = useCallback((node: TreeNode) => {
    setSelectedShipNode(node)
    setFittingDialogOpen(true)
  }, [])

  if (sortedNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-content-secondary">No items to display.</p>
      </div>
    )
  }

  return (
    <div
      ref={tableContainerRef}
      className="h-full rounded-lg border border-border bg-surface-secondary/30 overflow-auto"
    >
        <Table style={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            <TableRow className="bg-surface-secondary hover:bg-surface-secondary">
              {visibleColumns.map((colId) => {
                const col = TREE_COLUMNS.find(c => c.id === colId)
                if (!col) return null
                return (
                  <SortableHeader
                    key={colId}
                    column={colId as TreeSortColumn}
                    label={col.label}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className={cn(COLUMN_WIDTHS[colId], COLUMN_ALIGN[colId])}
                  />
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {flatRows.length > 0 ? (
              <>
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
                      style={{ height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0 }}
                    />
                  </tr>
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const node = flatRows[virtualRow.index]
                  if (!node) return null
                  return (
                    <TreeRow
                      key={node.id}
                      node={node}
                      virtualIndex={virtualRow.index}
                      isExpanded={expandedNodes.has(node.id)}
                      onToggleExpand={onToggleExpand}
                      onViewFitting={handleViewFitting}
                      visibleColumns={visibleColumns}
                    />
                  )
                })}
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={visibleColumns.length}
                      style={{
                        height:
                          rowVirtualizer.getTotalSize() -
                          (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                      }}
                    />
                  </tr>
                )}
              </>
            ) : (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="h-24 text-center">
                  No items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

      <FittingDialog
        open={fittingDialogOpen}
        onOpenChange={setFittingDialogOpen}
        shipNode={selectedShipNode}
      />
    </div>
  )
}

export function useTreeState(nodes: TreeNode[]) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allIds = getAllNodeIds(nodes)
    setExpandedNodes(new Set(allIds))
  }, [nodes])

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set())
  }, [])

  return {
    expandedNodes,
    toggleExpand,
    expandAll,
    collapseAll,
  }
}
