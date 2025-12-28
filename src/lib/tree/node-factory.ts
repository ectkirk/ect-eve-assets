import { type ResolvedAsset, getAssetDisplayNames } from '../resolved-asset'
import {
  type TreeNode,
  type TreeNodeType,
  CategoryIds,
  OFFICE_TYPE_ID,
  DIVISION_FLAG_NAMES,
} from '../tree-types'
import { getType, type CachedType } from '@/store/reference-cache'

export function isShip(type: CachedType | undefined): boolean {
  return type?.categoryId === CategoryIds.SHIP
}

export function isOffice(typeId: number): boolean {
  return typeId === OFFICE_TYPE_ID
}

export function createItemNode(
  ra: ResolvedAsset,
  depth: number,
  stationName?: string
): TreeNode {
  const type = getType(ra.typeId)
  const names = getAssetDisplayNames(ra)

  let nodeType: TreeNodeType = 'item'
  let displayName = names.typeName

  if (isOffice(ra.typeId)) {
    nodeType = 'office'
    displayName = stationName ?? 'Unknown Location'
  } else if (isShip(type)) {
    nodeType = 'ship'
  }

  return {
    id: `asset-${ra.asset.item_id}`,
    nodeType,
    name: displayName,
    depth,
    children: [],
    asset: ra.asset,
    typeId: ra.typeId,
    typeName: names.typeName,
    categoryId: ra.categoryId,
    categoryName: names.categoryName,
    groupName: names.groupName,
    locationId: ra.rootLocationId,
    systemId: ra.systemId,
    regionId: ra.regionId,
    quantity: ra.asset.quantity,
    totalCount: ra.asset.quantity,
    totalValue: ra.totalValue,
    totalVolume: ra.totalVolume,
    price: ra.price,
    ownerId: ra.owner.id,
    ownerName: ra.owner.name,
    ownerType: ra.owner.type,
    isBlueprintCopy: ra.isBlueprintCopy,
    isInContract: ra.modeFlags.isContract,
    isInMarketOrder: ra.modeFlags.isMarketOrder,
    isInIndustryJob: ra.modeFlags.isIndustryJob,
    isOwnedStructure: ra.modeFlags.isOwnedStructure,
    isActiveShip: ra.modeFlags.isActiveShip,
  }
}

export function getDivisionNumber(flag: string): number | undefined {
  const match = flag.match(/^CorpSAG([1-7])$/)
  return match ? parseInt(match[1]!, 10) : undefined
}

export function createDivisionNode(
  officeItemId: number,
  flag: string,
  depth: number,
  hangarDivisionNames?: Map<number, string>
): TreeNode {
  const divisionNum = getDivisionNumber(flag)
  const customName = divisionNum
    ? hangarDivisionNames?.get(divisionNum)
    : undefined
  const defaultName = DIVISION_FLAG_NAMES[flag] || flag
  const divisionName = customName || defaultName

  return {
    id: `division-${officeItemId}-${flag}`,
    nodeType: 'division',
    name: divisionName,
    depth,
    children: [],
    totalCount: 0,
    totalValue: 0,
    totalVolume: 0,
    divisionNumber: divisionNum,
  }
}

export function createLocationNode(
  nodeType: TreeNodeType,
  id: string,
  name: string,
  depth: number,
  locationInfo?: {
    locationId?: number
    regionId?: number
    regionName?: string
    systemId?: number
    systemName?: string
  }
): TreeNode {
  return {
    id,
    nodeType,
    name,
    depth,
    children: [],
    totalCount: 0,
    totalValue: 0,
    totalVolume: 0,
    ...locationInfo,
  }
}

function countItemLines(node: TreeNode): number {
  const isItemNode = node.nodeType === 'item' || node.nodeType === 'ship'
  let count = isItemNode ? 1 : 0
  for (const child of node.children) {
    count += countItemLines(child)
  }
  return count
}

export function aggregateTotals(node: TreeNode): void {
  const isItemNode = node.nodeType === 'item' || node.nodeType === 'ship'

  let totalCount = isItemNode ? (node.quantity ?? 0) : 0
  let totalValue = isItemNode ? (node.price ?? 0) * (node.quantity ?? 0) : 0
  let totalVolume = 0

  if (isItemNode && node.asset) {
    const type = getType(node.asset.type_id)
    totalVolume =
      (type?.packagedVolume ?? type?.volume ?? 0) * (node.quantity ?? 0)
  }

  for (const child of node.children) {
    aggregateTotals(child)
    totalCount += child.totalCount
    totalValue += child.totalValue
    totalVolume += child.totalVolume
  }

  if (node.nodeType === 'station') {
    totalCount = countItemLines(node)
  }

  node.totalCount = totalCount
  node.totalValue = totalValue
  node.totalVolume = totalVolume
}

export function stackIdenticalItems(nodes: TreeNode[]): TreeNode[] {
  const stackMap = new Map<string, TreeNode>()
  const result: TreeNode[] = []

  for (const node of nodes) {
    if (node.children.length > 0 || node.nodeType === 'ship') {
      result.push(node)
      continue
    }

    const locationFlag = node.asset?.location_flag ?? ''
    const stackKey = `${node.typeId}-${node.isBlueprintCopy ?? false}-${node.ownerId}-${locationFlag}-${node.name}`

    const existing = stackMap.get(stackKey)
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + (node.quantity ?? 0)
      existing.totalCount += node.totalCount
      existing.totalValue += node.totalValue
      existing.totalVolume += node.totalVolume
      if (!existing.stackedAssets) {
        existing.stackedAssets = [existing.asset!]
      }
      existing.stackedAssets.push(node.asset!)
    } else {
      stackMap.set(stackKey, node)
      result.push(node)
    }
  }

  return result
}
