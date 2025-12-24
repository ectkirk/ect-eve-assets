import { memo, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { TableCell } from '@/components/ui/table'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { AbyssalPreview } from '@/components/ui/abyssal-preview'
import { isAbyssalTypeId } from '@/api/mutamarket-client'
import { usePriceStore } from '@/store/price-store'
import { cn } from '@/lib/utils'
import type { TreeNode, TreeNodeType } from '@/lib/tree-types'
import {
  NODE_TYPE_ICONS,
  NODE_TYPE_COLORS,
  DIVISION_COLORS,
  formatNumber,
  formatVolume,
} from './types'

export const TreeNodeIcon = memo(function TreeNodeIcon({
  nodeType,
  divisionNumber,
}: {
  nodeType: TreeNodeType
  divisionNumber?: number
}) {
  const Icon = NODE_TYPE_ICONS[nodeType]
  let colorClass = NODE_TYPE_COLORS[nodeType]
  if (
    nodeType === 'division' &&
    divisionNumber !== undefined &&
    divisionNumber >= 1 &&
    divisionNumber <= 7
  ) {
    colorClass = DIVISION_COLORS[divisionNumber - 1]!
  }
  return <Icon className={cn('h-4 w-4 flex-shrink-0', colorClass)} />
})

export const ItemIcon = memo(function ItemIcon({ node }: { node: TreeNode }) {
  if (!node.typeId) {
    return (
      <TreeNodeIcon
        nodeType={node.nodeType}
        divisionNumber={node.divisionNumber}
      />
    )
  }

  return (
    <TypeIcon
      typeId={node.typeId}
      categoryId={node.categoryId}
      isBlueprintCopy={node.isBlueprintCopy}
    />
  )
})

interface TreeRowContentProps {
  node: TreeNode
  isExpanded: boolean
  onToggleExpand: (nodeId: string) => void
  visibleColumns: string[]
}

export const TreeRowContent = memo(function TreeRowContent({
  node,
  isExpanded,
  onToggleExpand,
  visibleColumns,
}: TreeRowContentProps) {
  const hasChildren = node.children.length > 0
  const indentPx = node.depth * 20

  const isAssetNode = node.nodeType === 'item' || node.nodeType === 'ship'
  const isLocationNode =
    node.nodeType === 'region' ||
    node.nodeType === 'system' ||
    node.nodeType === 'station'
  const isOfficeNode = node.nodeType === 'office'
  const isDivisionNode = node.nodeType === 'division'

  const handleToggleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleExpand(node.id)
    },
    [onToggleExpand, node.id]
  )

  return (
    <>
      {visibleColumns.map((colId) => {
        if (colId === 'name') {
          return (
            <TableCell key={colId} className="py-1.5 overflow-hidden">
              <div
                className="flex flex-nowrap items-center gap-1 min-w-0"
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

                {isAssetNode && node.ownerId && node.ownerType && (
                  <OwnerIcon
                    ownerId={node.ownerId}
                    ownerType={node.ownerType}
                    size="sm"
                  />
                )}

                {isAssetNode ? (
                  <ItemIcon node={node} />
                ) : (
                  <TreeNodeIcon
                    nodeType={node.nodeType}
                    divisionNumber={node.divisionNumber}
                  />
                )}

                {(() => {
                  const nameSpan = (
                    <span
                      className={cn(
                        'truncate min-w-0',
                        isLocationNode &&
                          node.nodeType === 'region' &&
                          'font-semibold text-accent',
                        isLocationNode &&
                          node.nodeType === 'system' &&
                          'font-medium text-status-highlight',
                        isLocationNode &&
                          node.nodeType === 'station' &&
                          'text-status-info',
                        isOfficeNode && 'font-medium',
                        isDivisionNode &&
                          node.divisionNumber &&
                          DIVISION_COLORS[node.divisionNumber - 1],
                        node.isBlueprintCopy && 'text-status-special'
                      )}
                      title={node.name}
                    >
                      {isOfficeNode ? (
                        <>
                          <span className="text-status-highlight">
                            {node.name}
                          </span>
                          <span className="text-content-muted italic ml-1">
                            Office
                          </span>
                        </>
                      ) : (
                        node.name
                      )}
                    </span>
                  )
                  if (
                    node.typeId &&
                    node.asset?.item_id &&
                    isAbyssalTypeId(node.typeId) &&
                    usePriceStore.getState().hasAbyssalPrice(node.asset.item_id)
                  ) {
                    return (
                      <AbyssalPreview itemId={node.asset.item_id}>
                        {nameSpan}
                      </AbyssalPreview>
                    )
                  }
                  return nameSpan
                })()}
                {(node.isInContract ||
                  node.isInMarketOrder ||
                  node.isInIndustryJob ||
                  node.isOwnedStructure ||
                  node.isActiveShip) && (
                  <span className="shrink-0 inline-flex items-center gap-1 ml-2 whitespace-nowrap">
                    {node.isActiveShip && (
                      <span className="text-xs text-status-time bg-status-time/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                        Active Ship
                      </span>
                    )}
                    {node.isInContract && (
                      <span className="text-xs text-status-corp bg-semantic-warning/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                        In Contract
                      </span>
                    )}
                    {node.isInMarketOrder && (
                      <span className="text-xs text-status-info bg-accent/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                        Sell Order
                      </span>
                    )}
                    {node.isInIndustryJob && (
                      <span className="text-xs text-status-positive bg-status-positive/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                        In Job
                      </span>
                    )}
                    {node.isOwnedStructure && (
                      <span className="text-xs text-status-special bg-status-special/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                        Structure
                      </span>
                    )}
                  </span>
                )}
              </div>
            </TableCell>
          )
        }
        if (colId === 'region') {
          return (
            <TableCell
              key={colId}
              className="py-1.5 text-content-secondary w-40"
            >
              {node.nodeType !== 'region' && node.regionName
                ? node.regionName
                : '-'}
            </TableCell>
          )
        }
        if (colId === 'quantity') {
          return (
            <TableCell
              key={colId}
              className="py-1.5 text-right tabular-nums w-24"
            >
              {node.totalCount > 0 ? node.totalCount.toLocaleString() : '-'}
            </TableCell>
          )
        }
        if (colId === 'value') {
          return (
            <TableCell
              key={colId}
              className="py-1.5 text-right tabular-nums text-status-positive w-32"
            >
              {node.totalValue > 0
                ? formatNumber(node.totalValue) + ' ISK'
                : '-'}
            </TableCell>
          )
        }
        if (colId === 'volume') {
          return (
            <TableCell
              key={colId}
              className="py-1.5 text-right tabular-nums text-content-secondary w-32"
            >
              {node.nodeType !== 'region' &&
              node.nodeType !== 'system' &&
              node.totalVolume > 0
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
