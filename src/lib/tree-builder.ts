import type { ResolvedAsset } from './resolved-asset'
import {
  type TreeNode,
  type TreeNodeType,
  TreeMode,
  CategoryIds,
  OFFICE_TYPE_ID,
  DIVISION_FLAG_NAMES,
  OFFICE_DIVISION_FLAGS,
} from './tree-types'
import { getType, type CachedType } from '@/store/reference-cache'

export interface TreeBuilderOptions {
  mode: TreeMode
  hangarDivisionNames?: Map<number, string>
}

function isShip(type: CachedType | undefined): boolean {
  return type?.categoryId === CategoryIds.SHIP
}

function isOffice(typeId: number): boolean {
  return typeId === OFFICE_TYPE_ID
}

function isContainer(type: CachedType | undefined): boolean {
  if (!type) return false
  if (type.id === OFFICE_TYPE_ID) return false
  const name = type.name.toLowerCase()
  return (
    name.includes('container') ||
    name.includes('depot') ||
    name.includes('can') ||
    name.includes('vault') ||
    name.includes('hangar array') ||
    type.groupName?.toLowerCase().includes('container') === true
  )
}

function shouldIncludeByMode(ra: ResolvedAsset, mode: TreeMode): boolean {
  const mf = ra.modeFlags

  if (mf.isContract || mf.isMarketOrder || mf.isIndustryJob || mf.isOwnedStructure) {
    return mode === TreeMode.ALL
  }

  switch (mode) {
    case TreeMode.ALL:
      return true
    case TreeMode.ITEM_HANGAR:
      return mf.inItemHangar
    case TreeMode.SHIP_HANGAR:
      return mf.inShipHangar
    case TreeMode.DELIVERIES:
      return mf.inDeliveries
    case TreeMode.ASSET_SAFETY:
      return mf.inAssetSafety
    case TreeMode.OFFICE:
      return mf.inOffice
    case TreeMode.STRUCTURES:
      return mf.inStructure
    default:
      return true
  }
}

function createItemNode(
  ra: ResolvedAsset,
  depth: number,
  stationName?: string
): TreeNode {
  const type = getType(ra.typeId)

  let nodeType: TreeNodeType = 'item'
  let displayName = ra.typeName

  if (isOffice(ra.typeId)) {
    nodeType = 'office'
    displayName = stationName ?? 'Unknown Location'
  } else if (isShip(type)) {
    nodeType = 'ship'
  } else if (isContainer(type)) {
    nodeType = 'container'
  }

  return {
    id: `asset-${ra.asset.item_id}`,
    nodeType,
    name: displayName,
    depth,
    children: [],
    asset: ra.asset,
    typeId: ra.typeId,
    typeName: ra.typeName,
    categoryId: ra.categoryId,
    categoryName: ra.categoryName,
    groupName: ra.groupName,
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
  }
}

function getDivisionNumber(flag: string): number | undefined {
  const match = flag.match(/^CorpSAG(\d)$/)
  return match ? parseInt(match[1]!, 10) : undefined
}

function createDivisionNode(
  officeItemId: number,
  flag: string,
  depth: number,
  hangarDivisionNames?: Map<number, string>
): TreeNode {
  const divisionNum = getDivisionNumber(flag)
  const customName = divisionNum ? hangarDivisionNames?.get(divisionNum) : undefined
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

function createLocationNode(
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
  const isItemNode = node.nodeType === 'item' || node.nodeType === 'stack' ||
    node.nodeType === 'ship' || node.nodeType === 'container'
  let count = isItemNode ? 1 : 0
  for (const child of node.children) {
    count += countItemLines(child)
  }
  return count
}

function aggregateTotals(node: TreeNode): void {
  let totalCount = node.quantity ?? 0
  let totalValue = node.price ? node.price * (node.quantity ?? 0) : 0
  let totalVolume = 0

  if (node.asset) {
    const type = getType(node.asset.type_id)
    totalVolume = (type?.packagedVolume ?? type?.volume ?? 0) * (node.quantity ?? 0)
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

function findNodeRecursive(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children.length > 0) {
      const found = findNodeRecursive(node.children, id)
      if (found) return found
    }
  }
  return undefined
}

function stackIdenticalItems(nodes: TreeNode[]): TreeNode[] {
  const stackMap = new Map<string, TreeNode>()
  const result: TreeNode[] = []

  for (const node of nodes) {
    if (node.children.length > 0 || node.nodeType === 'container' || node.nodeType === 'ship') {
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

export function buildTree(
  resolvedAssets: ResolvedAsset[],
  options: TreeBuilderOptions
): TreeNode[] {
  const { mode, hangarDivisionNames } = options

  const itemIdToResolved = new Map<number, ResolvedAsset>()
  for (const ra of resolvedAssets) {
    itemIdToResolved.set(ra.asset.item_id, ra)
  }

  const filteredAssets: ResolvedAsset[] = []
  const seenItemIds = new Set<number>()

  for (const ra of resolvedAssets) {
    if (seenItemIds.has(ra.asset.item_id)) continue
    if (shouldIncludeByMode(ra, mode)) {
      filteredAssets.push(ra)
      seenItemIds.add(ra.asset.item_id)
    }
  }

  const stationNodes = new Map<string, TreeNode>()
  const addedItemIds = new Set<number>()

  for (const ra of filteredAssets) {
    if (addedItemIds.has(ra.asset.item_id)) continue

    const stationKey = `station-${ra.rootLocationId}`
    let stationNode = stationNodes.get(stationKey)
    if (!stationNode) {
      stationNode = createLocationNode('station', stationKey, ra.locationName, 0, {
        locationId: ra.rootLocationId,
        regionId: ra.regionId,
        regionName: ra.regionName,
        systemId: ra.systemId,
        systemName: ra.systemName,
      })
      stationNodes.set(stationKey, stationNode)
    }

    const parentChain = ra.parentChain.filter((p) => p.item_id !== ra.rootLocationId)

    let officeIndex = -1
    let divisionFlag: string | undefined
    for (let i = 0; i < parentChain.length; i++) {
      if (isOffice(parentChain[i]!.type_id)) {
        officeIndex = i
        if (i === 0) {
          divisionFlag = OFFICE_DIVISION_FLAGS.has(ra.asset.location_flag) ? ra.asset.location_flag : undefined
        } else {
          const childOfOffice = parentChain[i - 1]!
          divisionFlag = OFFICE_DIVISION_FLAGS.has(childOfOffice.location_flag)
            ? childOfOffice.location_flag
            : undefined
        }
        break
      }
    }

    let currentParent: TreeNode = stationNode
    let currentDepth = 1
    let divisionInserted = false

    for (let i = parentChain.length - 1; i >= 0; i--) {
      const parentAsset = parentChain[i]!
      const parentResolved = itemIdToResolved.get(parentAsset.item_id)
      const parentNodeId = `asset-${parentAsset.item_id}`

      let parentNode = findNodeRecursive(currentParent.children, parentNodeId)

      if (!parentNode && parentResolved) {
        parentNode = createItemNode(parentResolved, currentDepth, ra.locationName)
        currentParent.children.push(parentNode)
        addedItemIds.add(parentAsset.item_id)
      } else if (!parentNode) {
        const parentType = getType(parentAsset.type_id)
        let pNodeType: TreeNodeType = 'item'
        if (isOffice(parentAsset.type_id)) {
          pNodeType = 'office'
        } else if (isShip(parentType)) {
          pNodeType = 'ship'
        } else if (isContainer(parentType)) {
          pNodeType = 'container'
        }

        parentNode = {
          id: parentNodeId,
          nodeType: pNodeType,
          name: pNodeType === 'office' ? ra.locationName : (parentType?.name ?? `Unknown ${parentAsset.type_id}`),
          depth: currentDepth,
          children: [],
          asset: parentAsset,
          typeId: parentAsset.type_id,
          typeName: parentType?.name ?? `Unknown ${parentAsset.type_id}`,
          categoryId: parentType?.categoryId,
          categoryName: parentType?.categoryName,
          groupName: parentType?.groupName,
          quantity: parentAsset.quantity,
          totalCount: parentAsset.quantity,
          totalValue: 0,
          totalVolume: 0,
          ownerId: ra.owner.id,
          ownerName: ra.owner.name,
          ownerType: ra.owner.type,
        }
        currentParent.children.push(parentNode)
        addedItemIds.add(parentAsset.item_id)
      }

      currentParent = parentNode
      currentDepth = parentNode.depth + 1

      if (i === officeIndex && divisionFlag && !divisionInserted) {
        const divisionNodeId = `division-${parentAsset.item_id}-${divisionFlag}`
        let divisionNode = currentParent.children.find((n) => n.id === divisionNodeId)

        if (!divisionNode) {
          divisionNode = createDivisionNode(
            parentAsset.item_id,
            divisionFlag,
            currentDepth,
            hangarDivisionNames
          )
          currentParent.children.push(divisionNode)
        }

        currentParent = divisionNode
        currentDepth = divisionNode.depth + 1
        divisionInserted = true
      }
    }

    const itemNode = createItemNode(ra, currentDepth, ra.locationName)
    currentParent.children.push(itemNode)
    addedItemIds.add(ra.asset.item_id)
  }

  const stackRecursive = (nodes: TreeNode[]): TreeNode[] => {
    const stacked = stackIdenticalItems(nodes)
    for (const node of stacked) {
      if (node.children.length > 0) {
        node.children = stackRecursive(node.children)
      }
    }
    return stacked
  }

  for (const stationNode of stationNodes.values()) {
    stationNode.children = stackRecursive(stationNode.children)
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => a.name.localeCompare(b.name))
  }

  const sortRecursive = (nodes: TreeNode[]): TreeNode[] => {
    const sorted = sortNodes(nodes)
    for (const node of sorted) {
      if (node.children.length > 0) {
        node.children = sortRecursive(node.children)
      }
    }
    return sorted
  }

  for (const stationNode of stationNodes.values()) {
    stationNode.children = sortRecursive(stationNode.children)
    aggregateTotals(stationNode)
  }

  if (mode === TreeMode.OFFICE) {
    const officeNodes: TreeNode[] = []
    for (const stationNode of stationNodes.values()) {
      for (const child of stationNode.children) {
        if (child.nodeType === 'office') {
          const adjustDepth = (node: TreeNode, delta: number): void => {
            node.depth += delta
            for (const c of node.children) adjustDepth(c, delta)
          }
          adjustDepth(child, -1)
          child.regionName = stationNode.regionName
          child.systemName = stationNode.systemName
          child.locationId = stationNode.locationId
          officeNodes.push(child)
        }
      }
    }
    return sortNodes(officeNodes)
  }

  return sortNodes(Array.from(stationNodes.values()))
}

export function flattenTree(
  nodes: TreeNode[],
  expandedNodes: Set<string>,
  result: TreeNode[] = []
): TreeNode[] {
  for (const node of nodes) {
    result.push(node)
    if (node.children.length > 0 && expandedNodes.has(node.id)) {
      flattenTree(node.children, expandedNodes, result)
    }
  }
  return result
}

export function getAllNodeIds(nodes: TreeNode[], result: string[] = []): string[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      result.push(node.id)
      getAllNodeIds(node.children, result)
    }
  }
  return result
}

function nodeMatchesSearch(node: TreeNode, searchLower: string): boolean {
  if (node.name.toLowerCase().includes(searchLower)) return true
  if (node.typeName?.toLowerCase().includes(searchLower)) return true
  if (node.groupName?.toLowerCase().includes(searchLower)) return true
  if (node.regionName?.toLowerCase().includes(searchLower)) return true
  if (node.systemName?.toLowerCase().includes(searchLower)) return true
  return false
}

function nodeMatchesCategory(node: TreeNode, category: string): boolean {
  if (node.categoryName === category) return true
  return false
}

function filterTreeRecursive(nodes: TreeNode[], searchLower: string, category?: string): TreeNode[] {
  const result: TreeNode[] = []

  for (const node of nodes) {
    const filteredChildren = filterTreeRecursive(node.children, searchLower, category)
    const selfMatchesSearch = !searchLower || nodeMatchesSearch(node, searchLower)
    const selfMatchesCategory = !category || nodeMatchesCategory(node, category)
    const selfMatches = selfMatchesSearch && selfMatchesCategory

    if (selfMatches || filteredChildren.length > 0) {
      const filteredNode: TreeNode = {
        ...node,
        children: selfMatches ? filterTreeRecursive(node.children, searchLower, category) : filteredChildren,
      }
      result.push(filteredNode)
    }
  }

  return result
}

function recomputeTotals(node: TreeNode): void {
  const isItemNode = node.nodeType === 'item' || node.nodeType === 'stack' ||
    node.nodeType === 'ship' || node.nodeType === 'container'

  let totalCount = isItemNode ? (node.quantity ?? 0) : 0
  let totalValue = isItemNode ? (node.price ?? 0) * (node.quantity ?? 0) : 0
  let totalVolume = 0

  if (isItemNode && node.asset) {
    const type = getType(node.asset.type_id)
    totalVolume = (type?.packagedVolume ?? type?.volume ?? 0) * (node.quantity ?? 0)
  }

  for (const child of node.children) {
    recomputeTotals(child)
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

export function filterTree(nodes: TreeNode[], search: string, category?: string): TreeNode[] {
  if (!search && !category) return nodes

  const filtered = filterTreeRecursive(nodes, search.toLowerCase(), category)

  for (const node of filtered) {
    recomputeTotals(node)
  }

  return filtered
}

export function getTreeCategories(nodes: TreeNode[]): string[] {
  const categories = new Set<string>()

  function collectCategories(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      if (node.categoryName) {
        categories.add(node.categoryName)
      }
      if (node.children.length > 0) {
        collectCategories(node.children)
      }
    }
  }

  collectCategories(nodes)
  return Array.from(categories).sort()
}

export function countTreeItems(nodes: TreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.asset) {
      count += 1
    }
    if (node.children.length > 0) {
      count += countTreeItems(node.children)
    }
  }
  return count
}
