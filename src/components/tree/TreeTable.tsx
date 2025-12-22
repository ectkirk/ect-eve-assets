import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useSortable, SortableHeader, useRowSelection } from '@/hooks'
import { useColumnSettings } from '@/hooks'
import type { TreeNode } from '@/lib/tree-types'
import { flattenTree, getAllNodeIds } from '@/lib/tree-builder'
import { getType } from '@/store/reference-cache'
import { cn } from '@/lib/utils'
import { useTabControls } from '@/context'
import { FittingDialog } from '@/components/dialogs/FittingDialog'
import {
  type TreeSortColumn,
  type TreeTableProps,
  sortTreeNodes,
  formatNumber,
  formatVolume,
  TREE_COLUMNS,
  COLUMN_STYLES,
} from './types'
import { TreeRow } from './TreeRow'

export function TreeTable({
  nodes,
  expandedNodes,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
  storageKey = 'tree-table',
}: TreeTableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null)

  const { getVisibleColumns, getColumnsForDropdown } = useColumnSettings(
    storageKey,
    TREE_COLUMNS
  )

  const visibleColumns = getVisibleColumns()

  const { sortColumn, sortDirection, handleSort } = useSortable<TreeSortColumn>(
    'value',
    'desc'
  )

  const sortedNodes = useMemo(
    () => sortTreeNodes(nodes, sortColumn, sortDirection),
    [nodes, sortColumn, sortDirection]
  )

  const flatRows = useMemo(
    () => flattenTree(sortedNodes, expandedNodes),
    [sortedNodes, expandedNodes]
  )

  const getNodeId = useCallback((node: TreeNode) => node.id, [])
  const getCopyData = useCallback((node: TreeNode) => {
    const isItem = node.nodeType === 'item' || node.nodeType === 'ship'
    const name = node.typeId
      ? (getType(node.typeId)?.name ?? node.name)
      : node.name
    const quantity = node.quantity ?? node.totalCount

    if (isItem) {
      return { name, quantity, isItem: true }
    }

    const fullRowData = [
      node.name,
      node.regionName ?? '-',
      node.totalCount.toLocaleString(),
      node.totalValue > 0 ? formatNumber(node.totalValue) + ' ISK' : '-',
      node.totalVolume > 0 ? formatVolume(node.totalVolume) : '-',
    ].join('\t')

    return { name, quantity, isItem: false, fullRowData }
  }, [])
  const { selectedIds, handleRowClick, selectedCount } = useRowSelection({
    items: flatRows,
    getId: getNodeId,
    getCopyData,
    containerRef: tableContainerRef,
  })

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 15,
  })

  const allNodeIds = useMemo(() => getAllNodeIds(sortedNodes), [sortedNodes])
  const hasExpandableNodes = allNodeIds.length > 0
  const isAllExpanded =
    hasExpandableNodes && allNodeIds.every((id) => expandedNodes.has(id))

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
  }, [
    hasExpandableNodes,
    isAllExpanded,
    onExpandAll,
    onCollapseAll,
    setExpandCollapse,
  ])

  const [fittingDialogOpen, setFittingDialogOpen] = useState(false)
  const [selectedShipNode, setSelectedShipNode] = useState<TreeNode | null>(
    null
  )

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
    <div className="flex flex-col h-full">
      {selectedCount > 0 && (
        <div className="px-3 py-1.5 text-xs text-content-secondary bg-surface-secondary/50 border-b border-border flex-shrink-0">
          {selectedCount} selected — Ctrl+C to copy
        </div>
      )}
      <div
        ref={tableContainerRef}
        tabIndex={0}
        className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-auto outline-none focus:ring-1 focus:ring-accent/50"
      >
        <Table style={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            <TableRow className="bg-surface-secondary hover:bg-surface-secondary">
              {visibleColumns.map((colId) => {
                const col = TREE_COLUMNS.find((c) => c.id === colId)
                if (!col) return null
                return (
                  <SortableHeader
                    key={colId}
                    column={colId as TreeSortColumn}
                    label={col.label}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    className={cn(
                      COLUMN_STYLES[colId]?.width,
                      COLUMN_STYLES[colId]?.align
                    )}
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
                      style={{
                        height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0,
                      }}
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
                      isSelected={selectedIds.has(node.id)}
                      onToggleExpand={onToggleExpand}
                      onRowClick={handleRowClick}
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
                <TableCell
                  colSpan={visibleColumns.length}
                  className="h-24 text-center"
                >
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
    </div>
  )
}
