import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { TableRow } from '@/components/ui/table'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { isAbyssalTypeId, getMutamarketUrl } from '@/api/mutamarket-client'
import { usePriceStore } from '@/store/price-store'
import { getType } from '@/store/reference-cache'
import { useRegionalMarketActionStore } from '@/store/regional-market-action-store'
import { useContractsSearchActionStore } from '@/store/contracts-search-action-store'
import { useReferenceActionStore } from '@/store/reference-action-store'
import { SERVICE_REGIONS } from '@/hooks'
import { cn } from '@/lib/utils'
import type { TreeNode } from '@/lib/tree-types'
import { TreeRowContent } from './TreeRowContent'

interface TreeRowProps {
  node: TreeNode
  virtualIndex: number
  isExpanded: boolean
  isSelected: boolean
  showBuybackOption: boolean
  showFreightOption: boolean
  onToggleExpand: (nodeId: string) => void
  onRowClick: (id: string, event: React.MouseEvent) => void
  onViewFitting: (node: TreeNode) => void
  onSellToBuyback: (node: TreeNode) => void
  onShipFreight: (node: TreeNode) => void
  onOpenMarketIngame?: (typeId: number, typeName?: string) => void
  onSetAutopilotIngame?: (locationId: number, locationName?: string) => void
  visibleColumns: string[]
}

export const TreeRow = memo(function TreeRow({
  node,
  virtualIndex,
  isExpanded,
  isSelected,
  showBuybackOption,
  showFreightOption,
  onToggleExpand,
  onRowClick,
  onViewFitting,
  onSellToBuyback,
  onShipFreight,
  onOpenMarketIngame,
  onSetAutopilotIngame,
  visibleColumns,
}: TreeRowProps) {
  const { t } = useTranslation('common')
  const itemId = node.asset?.item_id
  const hasAbyssalPrice = usePriceStore((s) =>
    itemId ? s.abyssalPrices.has(itemId) : false
  )
  const hasChildren = node.children.length > 0

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      if (hasChildren) {
        onToggleExpand(node.id)
      } else {
        onRowClick(node.id, e)
      }
    },
    [node.id, hasChildren, onRowClick, onToggleExpand]
  )

  const handleViewFittingClick = useCallback(() => {
    onViewFitting(node)
  }, [node, onViewFitting])

  const handleOpenMutamarket = useCallback(() => {
    if (node.asset?.item_id && node.typeName) {
      window.open(getMutamarketUrl(node.typeName, node.asset.item_id), '_blank')
    }
  }, [node.asset, node.typeName])

  const navigateToType = useRegionalMarketActionStore((s) => s.navigateToType)
  const handleViewInMarket = useCallback(() => {
    if (node.typeId) {
      navigateToType(node.typeId)
    }
  }, [node.typeId, navigateToType])

  const navigateToContracts = useContractsSearchActionStore(
    (s) => s.navigateToContracts
  )
  const handleViewInContracts = useCallback(() => {
    if (node.typeId && node.typeName) {
      navigateToContracts(node.typeId, node.typeName)
    }
  }, [node.typeId, node.typeName, navigateToContracts])

  const navigateToReference = useReferenceActionStore((s) => s.navigateToType)
  const handleViewDetails = useCallback(() => {
    if (node.typeId) {
      navigateToReference(node.typeId)
    }
  }, [node.typeId, navigateToReference])

  const handleOpenMarketIngame = useCallback(() => {
    if (node.typeId && onOpenMarketIngame) {
      onOpenMarketIngame(node.typeId, node.typeName)
    }
  }, [node.typeId, node.typeName, onOpenMarketIngame])

  const handleSetAutopilotIngame = useCallback(() => {
    if (node.locationId && onSetAutopilotIngame) {
      onSetAutopilotIngame(node.locationId, node.name)
    }
  }, [node.locationId, node.name, onSetAutopilotIngame])

  const isShip = node.nodeType === 'ship'
  const isAbyssalResolved =
    node.typeId && itemId && isAbyssalTypeId(node.typeId) && hasAbyssalPrice
  const isMarketItem = node.typeId && !!getType(node.typeId)?.marketGroupId

  const row = (
    <TableRow
      key={node.id}
      data-index={virtualIndex}
      className={cn(
        'cursor-pointer select-none',
        isSelected && 'bg-accent/20',
        !isSelected && node.nodeType === 'region' && 'bg-surface-secondary/30',
        !isSelected && node.nodeType === 'system' && 'bg-surface-secondary/20',
        !isSelected && node.isActiveShip && 'bg-row-active-ship',
        !isSelected && node.isInContract && 'bg-row-contract',
        !isSelected && node.isInMarketOrder && 'bg-row-order',
        !isSelected && node.isInIndustryJob && 'bg-row-industry',
        !isSelected && node.isOwnedStructure && 'bg-row-structure'
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

  const isInServiceRegion = node.regionId && SERVICE_REGIONS.has(node.regionId)
  const isStation = node.locationId && node.locationId < 100_000_000
  const showBuyback =
    (isSelected && showBuybackOption) ||
    (hasChildren && isInServiceRegion && isStation)
  const showFreight =
    (isSelected && showFreightOption) ||
    (hasChildren && isInServiceRegion && isStation)
  const canViewInContracts = node.typeId && node.typeName
  const canViewDetails = !!node.typeId
  const canOpenMarketIngame = isMarketItem && onOpenMarketIngame
  const canSetAutopilotIngame =
    node.nodeType === 'station' && node.locationId && onSetAutopilotIngame
  if (
    isShip ||
    isAbyssalResolved ||
    showBuyback ||
    showFreight ||
    isMarketItem ||
    canViewInContracts ||
    canViewDetails ||
    canOpenMarketIngame ||
    canSetAutopilotIngame
  ) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          {canViewInContracts && (
            <ContextMenuItem onClick={handleViewInContracts}>
              {t('contextMenu.viewInContracts')}
            </ContextMenuItem>
          )}
          {isMarketItem && (
            <ContextMenuItem onClick={handleViewInMarket}>
              {t('contextMenu.viewInMarket')}
            </ContextMenuItem>
          )}
          {canOpenMarketIngame && (
            <ContextMenuItem onClick={handleOpenMarketIngame}>
              {t('contextMenu.openMarketIngame')}
            </ContextMenuItem>
          )}
          {canSetAutopilotIngame && (
            <ContextMenuItem onClick={handleSetAutopilotIngame}>
              {t('contextMenu.setWaypoint')}
            </ContextMenuItem>
          )}
          {showBuyback && (
            <ContextMenuItem onClick={() => onSellToBuyback(node)}>
              {t('contextMenu.sellToBuyback')}
            </ContextMenuItem>
          )}
          {showFreight && (
            <ContextMenuItem onClick={() => onShipFreight(node)}>
              {t('contextMenu.shipItems')}
            </ContextMenuItem>
          )}
          {isShip && (
            <ContextMenuItem onClick={handleViewFittingClick}>
              {t('contextMenu.viewFitting')}
            </ContextMenuItem>
          )}
          {isAbyssalResolved && (
            <ContextMenuItem onClick={handleOpenMutamarket}>
              {t('contextMenu.openMutamarket', { ns: 'assets' })}
            </ContextMenuItem>
          )}
          {canViewDetails && (
            <ContextMenuItem onClick={handleViewDetails}>
              {t('contextMenu.viewDetails')}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  return row
})
