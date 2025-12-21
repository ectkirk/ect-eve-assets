import type { LucideIcon } from 'lucide-react'
import {
  Globe,
  Sun,
  Building2,
  Rocket,
  Box,
  Briefcase,
  Layers,
} from 'lucide-react'
import type { TreeNode, TreeNodeType } from '@/lib/tree-types'
import type { SortDirection } from '@/hooks'
import type { ColumnConfig } from '@/hooks'

export type TreeSortColumn = 'name' | 'region' | 'quantity' | 'value' | 'volume'

export function sortTreeNodes(
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
      children: sortTreeNodes(
        node.children,
        sortColumn,
        sortDirection,
        nodeRegion
      ),
    }
  })
}

export interface TreeTableProps {
  nodes: TreeNode[]
  expandedNodes: Set<string>
  onToggleExpand: (nodeId: string) => void
  onExpandAll: () => void
  onCollapseAll: () => void
  storageKey?: string
}

export function formatNumber(value: number): string {
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

export function formatVolume(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' m³'
}

export const NODE_TYPE_ICONS: Record<TreeNodeType, LucideIcon> = {
  region: Globe,
  system: Sun,
  station: Building2,
  office: Briefcase,
  division: Layers,
  ship: Rocket,
  item: Box,
}

export const NODE_TYPE_COLORS: Record<TreeNodeType, string> = {
  region: 'text-accent',
  system: 'text-status-highlight',
  station: 'text-status-info',
  office: 'text-status-highlight',
  division: 'text-content-secondary',
  ship: 'text-status-special',
  item: 'text-content-secondary',
}

export const DIVISION_COLORS = [
  'text-status-negative',
  'text-status-warning',
  'text-status-highlight',
  'text-status-positive',
  'text-status-positive',
  'text-status-special',
  'text-accent',
]

export const TREE_COLUMNS: ColumnConfig[] = [
  { id: 'name', label: 'Name' },
  { id: 'region', label: 'Region' },
  { id: 'quantity', label: 'Quantity' },
  { id: 'value', label: 'Value' },
  { id: 'volume', label: 'Volume', defaultVisible: false },
]

export const COLUMN_STYLES: Record<string, { width: string; align: string }> = {
  name: { width: 'w-auto', align: 'text-left' },
  region: { width: 'w-40', align: 'text-left' },
  quantity: { width: 'w-24', align: 'text-right' },
  value: { width: 'w-32', align: 'text-right' },
  volume: { width: 'w-32', align: 'text-right' },
}
