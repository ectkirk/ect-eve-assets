import { useMemo, useRef, useCallback, useState } from 'react'
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
  ChevronsUpDown,
  ChevronsDownUp,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TreeNode, TreeNodeType } from '@/lib/tree-types'
import { flattenTree, getAllNodeIds } from '@/lib/tree-builder'
import { cn } from '@/lib/utils'

interface TreeTableProps {
  nodes: TreeNode[]
  expandedNodes: Set<string>
  onToggleExpand: (nodeId: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
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
  region: 'text-purple-400',
  system: 'text-yellow-400',
  station: 'text-blue-400',
  office: 'text-amber-400',
  division: 'text-amber-300',
  container: 'text-orange-400',
  ship: 'text-cyan-400',
  item: 'text-slate-400',
  stack: 'text-slate-400',
}

function TreeNodeIcon({ nodeType }: { nodeType: TreeNodeType }) {
  const Icon = NODE_TYPE_ICONS[nodeType]
  const colorClass = NODE_TYPE_COLORS[nodeType]
  return <Icon className={cn('h-4 w-4 flex-shrink-0', colorClass)} />
}

const SKIN_CATEGORY_ID = 91
const BLUEPRINT_CATEGORY_ID = 9

function ItemIcon({ node }: { node: TreeNode }) {
  const typeId = node.typeId
  const categoryId = node.categoryId
  const isBpc = node.isBlueprintCopy

  if (!typeId) {
    return <TreeNodeIcon nodeType={node.nodeType} />
  }

  const isSkin = categoryId === SKIN_CATEGORY_ID
  const isBlueprint = categoryId === BLUEPRINT_CATEGORY_ID

  if (isSkin) {
    return <div className="h-5 w-5 flex-shrink-0 rounded bg-slate-700" />
  }

  let imageUrl = `https://images.evetech.net/types/${typeId}/icon?size=32`
  if (isBlueprint) {
    imageUrl = isBpc
      ? `https://images.evetech.net/types/${typeId}/bpc?size=32`
      : `https://images.evetech.net/types/${typeId}/bp?size=32`
  }

  return (
    <img
      src={imageUrl}
      alt=""
      className="h-5 w-5 flex-shrink-0"
      loading="lazy"
    />
  )
}

function TreeRowContent({ node, isExpanded, onToggle }: {
  node: TreeNode
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasChildren = node.children.length > 0
  const indentPx = node.depth * 20

  const isAssetNode = node.nodeType === 'item' || node.nodeType === 'stack' ||
    node.nodeType === 'ship' || node.nodeType === 'container'
  const isLocationNode = node.nodeType === 'region' || node.nodeType === 'system' ||
    node.nodeType === 'station'
  const isOfficeNode = node.nodeType === 'office'
  const isDivisionNode = node.nodeType === 'division'

  return (
    <>
      <TableCell className="py-1.5">
        <div
          className="flex items-center gap-1"
          style={{ paddingLeft: `${indentPx}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className="p-0.5 hover:bg-slate-700 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {isAssetNode ? (
            <ItemIcon node={node} />
          ) : (
            <TreeNodeIcon nodeType={node.nodeType} />
          )}

          <span
            className={cn(
              'truncate',
              isLocationNode && node.nodeType === 'region' && 'font-semibold text-purple-300',
              isLocationNode && node.nodeType === 'system' && 'font-medium text-yellow-300',
              isLocationNode && node.nodeType === 'station' && 'text-blue-300',
              isOfficeNode && 'font-medium text-amber-300',
              isDivisionNode && 'text-amber-200',
              node.isBlueprintCopy && 'text-cyan-400'
            )}
            title={node.name}
          >
            {node.name}
            {node.isBlueprintCopy && ' (Copy)'}
          </span>
        </div>
      </TableCell>

      <TableCell className="py-1.5 text-right tabular-nums w-24">
        {node.totalCount > 0 ? node.totalCount.toLocaleString() : '-'}
      </TableCell>

      <TableCell className="py-1.5 text-right tabular-nums text-green-400 w-32">
        {node.totalValue > 0 ? formatNumber(node.totalValue) + ' ISK' : '-'}
      </TableCell>

      <TableCell className="py-1.5 text-right tabular-nums text-slate-400 w-32">
        {node.totalVolume > 0 ? formatVolume(node.totalVolume) : '-'}
      </TableCell>
    </>
  )
}

export function TreeTable({
  nodes,
  expandedNodes,
  onToggleExpand,
  onExpandAll,
  onCollapseAll,
}: TreeTableProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null)

  const flatRows = useMemo(
    () => flattenTree(nodes, expandedNodes),
    [nodes, expandedNodes]
  )

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 15,
  })

  const totals = useMemo(() => {
    let totalCount = 0
    let totalValue = 0
    let totalVolume = 0

    for (const node of nodes) {
      totalCount += node.totalCount
      totalValue += node.totalValue
      totalVolume += node.totalVolume
    }

    return { totalCount, totalValue, totalVolume }
  }, [nodes])

  const hasExpandableNodes = useMemo(
    () => getAllNodeIds(nodes).length > 0,
    [nodes]
  )

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No items to display.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-400">Items: </span>
            <span className="font-medium">{totals.totalCount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400">Value: </span>
            <span className="font-medium text-green-400">
              {formatNumber(totals.totalValue)} ISK
            </span>
          </div>
          <div>
            <span className="text-slate-400">Volume: </span>
            <span className="font-medium">{formatVolume(totals.totalVolume)}</span>
          </div>
        </div>

        {hasExpandableNodes && (
          <div className="flex items-center gap-2">
            <button
              onClick={onExpandAll}
              className="flex items-center gap-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
              title="Expand all"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Expand
            </button>
            <button
              onClick={onCollapseAll}
              className="flex items-center gap-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
              title="Collapse all"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
              Collapse
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div
        ref={tableContainerRef}
        className="rounded-lg border border-slate-700 overflow-auto"
        style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}
      >
        <Table style={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHeader className="sticky top-0 z-10 bg-slate-800">
            <TableRow className="bg-slate-800 hover:bg-slate-800">
              <TableHead className="w-auto">Name</TableHead>
              <TableHead className="w-24 text-right">Count</TableHead>
              <TableHead className="w-32 text-right">Value</TableHead>
              <TableHead className="w-32 text-right">Volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flatRows.length > 0 ? (
              <>
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0 }}
                    />
                  </tr>
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const node = flatRows[virtualRow.index]
                  if (!node) return null
                  const isExpanded = expandedNodes.has(node.id)

                  return (
                    <TableRow
                      key={node.id}
                      data-index={virtualRow.index}
                      className={cn(
                        node.children.length > 0 && 'cursor-pointer',
                        node.nodeType === 'region' && 'bg-slate-800/30',
                        node.nodeType === 'system' && 'bg-slate-800/20'
                      )}
                      onClick={() => {
                        if (node.children.length > 0) {
                          onToggleExpand(node.id)
                        }
                      }}
                    >
                      <TreeRowContent
                        node={node}
                        isExpanded={isExpanded}
                        onToggle={() => onToggleExpand(node.id)}
                      />
                    </TableRow>
                  )
                })}
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={4}
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
                <TableCell colSpan={4} className="h-24 text-center">
                  No items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
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
