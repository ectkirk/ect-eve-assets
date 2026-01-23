import { useMemo, useRef, useCallback, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useSortable,
  SortableHeader,
  useRowSelection,
  useBuybackSelection,
  useFreightSelection,
} from '@/hooks'
import {
  useBuybackActionStore,
  getSecurityTab,
} from '@/store/buyback-action-store'
import { useFreightActionStore } from '@/store/freight-action-store'
import { getType, getSystem } from '@/store/reference-cache'
import { getBlueprintInfo } from '@/store/blueprints-store'
import { CategoryIds } from '@/lib/tree-types'
import { useColumnSettings } from '@/hooks'
import type { TreeNode, TreeNodeType } from '@/lib/tree-types'
import { flattenTree, getAllNodeIds, collectDescendantItems } from '@/lib/tree'
import { cn } from '@/lib/utils'

const LOCATION_NODE_TYPES: Set<TreeNodeType> = new Set([
  'station',
  'office',
  'division',
])
import { useTabControls } from '@/context'
import { FittingDialog } from '@/components/dialogs/FittingDialog'
import {
  type TreeSortColumn,
  type TreeTableProps,
  sortTreeNodes,
  formatNumber,
  formatFullNumber,
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
  onOpenMarketIngame,
  onSetAutopilotIngame,
}: TreeTableProps) {
  const { t } = useTranslation('common')
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
      let blueprintSuffix: string | undefined
      if (node.categoryId === CategoryIds.BLUEPRINT && node.asset?.item_id) {
        const bpInfo = getBlueprintInfo(node.asset.item_id)
        if (bpInfo) {
          blueprintSuffix = bpInfo.isCopy
            ? `(ME${bpInfo.materialEfficiency} TE${bpInfo.timeEfficiency} R${bpInfo.runs})`
            : `(ME${bpInfo.materialEfficiency} TE${bpInfo.timeEfficiency})`
        }
      }
      return { name, quantity, isItem: true, blueprintSuffix }
    }

    const fullRowData = [
      node.name,
      node.regionName ?? '-',
      formatFullNumber(node.totalCount),
      node.totalValue > 0 ? formatNumber(node.totalValue) : '-',
      node.totalVolume > 0 ? formatVolume(node.totalVolume) : '-',
    ].join('\t')

    return { name, quantity, isItem: false, fullRowData }
  }, [])
  const { selectedIds, handleRowClick } = useRowSelection({
    items: flatRows,
    getId: getNodeId,
    getCopyData,
    containerRef: tableContainerRef,
  })

  const { buybackItems, expandedBuybackIds, hasLocationSelected } =
    useMemo(() => {
      const itemNodes: TreeNode[] = []
      const expandedIds = new Set(selectedIds)
      let hasLocation = false

      for (const node of flatRows) {
        if (node.nodeType === 'item' || node.nodeType === 'ship') {
          itemNodes.push(node)
        }
        if (
          selectedIds.has(node.id) &&
          LOCATION_NODE_TYPES.has(node.nodeType)
        ) {
          hasLocation = true
          const descendants = collectDescendantItems(node)
          for (const desc of descendants) {
            expandedIds.add(desc.id)
            itemNodes.push(desc)
          }
        }
      }

      const seenIds = new Set<string>()
      const items = itemNodes
        .filter((node) => {
          if (seenIds.has(node.id)) return false
          seenIds.add(node.id)
          return true
        })
        .map((node) => ({
          id: node.id,
          name: node.typeId
            ? (getType(node.typeId)?.name ?? node.name)
            : node.name,
          quantity: node.quantity ?? node.totalCount,
          locationId: node.locationId,
          systemId: node.systemId,
          regionId: node.regionId,
        }))

      return {
        buybackItems: items,
        expandedBuybackIds: expandedIds,
        hasLocationSelected: hasLocation,
      }
    }, [selectedIds, flatRows])

  const { canSellToBuyback, handleSellToBuyback } = useBuybackSelection({
    selectedIds: expandedBuybackIds,
    items: buybackItems,
    minItems: hasLocationSelected ? 1 : 2,
  })

  const { canShipFreight, handleShipFreight } = useFreightSelection({
    selectedIds: expandedBuybackIds,
    items: buybackItems,
    minItems: hasLocationSelected ? 1 : 2,
  })

  const triggerBuyback = useBuybackActionStore((s) => s.triggerBuyback)
  const triggerFreight = useFreightActionStore((s) => s.triggerFreight)

  const handleNodeSellToBuyback = useCallback(
    (node: TreeNode) => {
      if (node.children.length > 0) {
        const descendants = collectDescendantItems(node)
        if (descendants.length === 0) return

        const first = descendants[0]
        if (!first?.locationId || first.locationId >= 100_000_000) return

        const items = descendants.map((n) => ({
          name: n.typeId ? (getType(n.typeId)?.name ?? n.name) : n.name,
          quantity: n.quantity ?? n.totalCount,
        }))

        if (!first.systemId) return

        const system = getSystem(first.systemId)
        const securityTab = getSecurityTab(system?.securityStatus)
        const text = items.map((i) => `${i.name}\t${i.quantity}`).join('\n')

        triggerBuyback({ text, securityTab })
      } else {
        handleSellToBuyback()
      }
    },
    [handleSellToBuyback, triggerBuyback]
  )

  const handleNodeShipFreight = useCallback(
    (node: TreeNode) => {
      if (node.children.length > 0) {
        const descendants = collectDescendantItems(node)
        if (descendants.length === 0) return

        const first = descendants[0]
        if (!first?.locationId || first.locationId >= 100_000_000) return

        const items = descendants.map((n) => ({
          name: n.typeId ? (getType(n.typeId)?.name ?? n.name) : n.name,
          quantity: n.quantity ?? n.totalCount,
        }))

        const system = first.systemId ? getSystem(first.systemId) : undefined
        const securityStatus = system?.securityStatus
        const nullSec =
          securityStatus !== undefined &&
          securityStatus !== null &&
          securityStatus <= 0.0

        const text = items.map((i) => `${i.name}\t${i.quantity}`).join('\n')
        triggerFreight({ text, nullSec })
      } else {
        handleShipFreight()
      }
    },
    [handleShipFreight, triggerFreight]
  )

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
        <p className="text-content-secondary">{t('tree.noItems')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
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
                      showBuybackOption={canSellToBuyback}
                      showFreightOption={canShipFreight}
                      onToggleExpand={onToggleExpand}
                      onRowClick={handleRowClick}
                      onViewFitting={handleViewFitting}
                      onSellToBuyback={handleNodeSellToBuyback}
                      onShipFreight={handleNodeShipFreight}
                      onOpenMarketIngame={onOpenMarketIngame}
                      onSetAutopilotIngame={onSetAutopilotIngame}
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
                  {t('tree.noItemsFound')}
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
