import type { ESIAsset } from '@/api/endpoints/assets'
import type { Owner } from '@/store/auth-store'
import {
  type TreeNode,
  type TreeNodeType,
  TreeMode,
  CategoryIds,
  HANGAR_FLAGS,
  SHIP_CONTENT_FLAGS,
  DELIVERY_FLAGS,
  ASSET_SAFETY_FLAGS,
  OFFICE_TYPE_ID,
  DIVISION_FLAG_NAMES,
  OFFICE_DIVISION_FLAGS,
} from './tree-types'
import {
  getType,
  getStructure,
  getLocation,
  getAbyssalPrice,
  type CachedType,
} from '@/store/reference-cache'

export interface AssetWithOwner {
  asset: ESIAsset
  owner: Owner
}

export interface TreeBuilderOptions {
  mode: TreeMode
  prices: Map<number, number>
  assetNames?: Map<number, string>
}

function isShip(type: CachedType | undefined): boolean {
  return type?.categoryId === CategoryIds.SHIP
}

function isOffice(typeId: number): boolean {
  return typeId === OFFICE_TYPE_ID
}

function isContainer(type: CachedType | undefined): boolean {
  if (!type) return false
  // Office is handled separately
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

function getParentChain(
  asset: ESIAsset,
  assetById: Map<number, AssetWithOwner>
): AssetWithOwner[] {
  const chain: AssetWithOwner[] = []
  let current = asset
  while (current.location_type === 'item') {
    const parent = assetById.get(current.location_id)
    if (!parent) break
    chain.push(parent)
    current = parent.asset
  }
  return chain
}

function getRootFlag(
  asset: ESIAsset,
  assetById: Map<number, AssetWithOwner>
): string {
  let current = asset
  while (current.location_type === 'item') {
    const parent = assetById.get(current.location_id)
    if (!parent) break
    current = parent.asset
  }
  return current.location_flag
}

function shouldIncludeAsset(
  asset: ESIAsset,
  type: CachedType | undefined,
  mode: TreeMode,
  assetById: Map<number, AssetWithOwner>
): boolean {
  const flag = asset.location_flag
  const rootFlag = getRootFlag(asset, assetById)
  const parentChain = getParentChain(asset, assetById)
  const immediateParent = parentChain[0]
  const immediateParentType = immediateParent ? getType(immediateParent.asset.type_id) : undefined

  switch (mode) {
    case TreeMode.ITEM_HANGAR: {
      if (isShip(type)) return false
      if (isOffice(asset.type_id)) return false
      const isInOffice = parentChain.some((p) => isOffice(p.asset.type_id))
      if (isInOffice) return false
      if (HANGAR_FLAGS.has(flag)) return true
      if (SHIP_CONTENT_FLAGS.has(flag) && HANGAR_FLAGS.has(rootFlag)) return true
      return false
    }

    case TreeMode.SHIP_HANGAR:
      if (!HANGAR_FLAGS.has(flag)) return false
      return isShip(type)

    case TreeMode.DELIVERIES:
      if (DELIVERY_FLAGS.has(flag)) return true
      if (SHIP_CONTENT_FLAGS.has(flag) && DELIVERY_FLAGS.has(rootFlag)) return true
      return false

    case TreeMode.ASSET_SAFETY:
      if (ASSET_SAFETY_FLAGS.has(flag)) return true
      if (SHIP_CONTENT_FLAGS.has(flag) && ASSET_SAFETY_FLAGS.has(rootFlag)) return true
      return false

    case TreeMode.OFFICE: {
      if (type?.categoryId === CategoryIds.STRUCTURE) return false
      const hasOfficeInChain = parentChain.some((p) => isOffice(p.asset.type_id))
      if (!hasOfficeInChain) {
        if (type?.id === OFFICE_TYPE_ID) {
          return immediateParentType?.categoryId !== CategoryIds.STRUCTURE
        }
        return false
      }
      return true
    }

    case TreeMode.STRUCTURES: {
      if (type?.categoryId === CategoryIds.STRUCTURE && asset.location_type === 'solar_system') {
        return true
      }
      if (isOffice(asset.type_id)) return false
      if (HANGAR_FLAGS.has(flag)) return false
      if (DELIVERY_FLAGS.has(flag)) return false
      if (ASSET_SAFETY_FLAGS.has(flag)) return false
      const isDirectlyInStructure = immediateParentType?.categoryId === CategoryIds.STRUCTURE
      return isDirectlyInStructure
    }

    default:
      return true
  }
}

function getAssetPrice(
  asset: ESIAsset,
  prices: Map<number, number>
): number {
  // Check abyssal price first (by item_id)
  const abyssalPrice = getAbyssalPrice(asset.item_id)
  if (abyssalPrice !== undefined) return abyssalPrice

  // Fall back to type price
  return prices.get(asset.type_id) ?? 0
}

function createItemNode(
  asset: ESIAsset,
  owner: Owner,
  type: CachedType | undefined,
  prices: Map<number, number>,
  assetNames?: Map<number, string>,
  depth: number = 0,
  stationName?: string
): TreeNode {
  const price = getAssetPrice(asset, prices)
  const volume = type?.volume ?? 0
  const customName = assetNames?.get(asset.item_id)
  const typeName = type?.name || `Unknown Type ${asset.type_id}`

  let nodeType: TreeNodeType = 'item'
  let displayName = customName || typeName

  if (isOffice(asset.type_id)) {
    nodeType = 'office'
    displayName = stationName ? `Office @ ${stationName}` : 'Office'
  } else if (isShip(type)) {
    nodeType = 'ship'
    displayName = customName ? `${typeName} (${customName})` : typeName
  } else if (isContainer(type)) {
    nodeType = 'container'
    displayName = customName ? `${typeName} (${customName})` : typeName
  }

  return {
    id: `asset-${asset.item_id}`,
    nodeType,
    name: displayName,
    depth,
    children: [],
    asset,
    typeId: asset.type_id,
    typeName: displayName,
    categoryId: type?.categoryId,
    categoryName: type?.categoryName,
    groupName: type?.groupName,
    quantity: asset.quantity,
    totalCount: asset.quantity,
    totalValue: price * asset.quantity,
    totalVolume: volume * asset.quantity,
    price,
    ownerId: owner.id,
    ownerName: owner.name,
    ownerType: owner.type,
    isBlueprintCopy: asset.is_blueprint_copy,
  }
}

function createDivisionNode(
  officeItemId: number,
  flag: string,
  depth: number
): TreeNode {
  const divisionName = DIVISION_FLAG_NAMES[flag] || flag
  return {
    id: `division-${officeItemId}-${flag}`,
    nodeType: 'division',
    name: divisionName,
    depth,
    children: [],
    totalCount: 0,
    totalValue: 0,
    totalVolume: 0,
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

function aggregateTotals(node: TreeNode): void {
  let totalCount = node.quantity ?? 0
  let totalValue = node.price ? node.price * (node.quantity ?? 0) : 0
  let totalVolume = 0

  if (node.asset) {
    const type = getType(node.asset.type_id)
    totalVolume = (type?.volume ?? 0) * (node.quantity ?? 0)
  }

  for (const child of node.children) {
    aggregateTotals(child)
    totalCount += child.totalCount
    totalValue += child.totalValue
    totalVolume += child.totalVolume
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
    // Only stack leaf items (not containers/ships with children)
    if (node.children.length > 0 || node.nodeType === 'container' || node.nodeType === 'ship') {
      result.push(node)
      continue
    }

    // Create stack key: typeId + isBlueprintCopy + ownerId
    const stackKey = `${node.typeId}-${node.isBlueprintCopy ?? false}-${node.ownerId}`

    const existing = stackMap.get(stackKey)
    if (existing) {
      // Merge into existing stack
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
  assetsWithOwners: AssetWithOwner[],
  options: TreeBuilderOptions
): TreeNode[] {
  const { mode, prices, assetNames } = options

  // Build lookup maps
  const assetById = new Map<number, AssetWithOwner>()
  for (const aw of assetsWithOwners) {
    assetById.set(aw.asset.item_id, aw)
  }

  // Get root location for an asset (station/structure)
  const getRootLocation = (
    asset: ESIAsset
  ): { locationId: number; locationType: string; rootItemId?: number } => {
    let current = asset
    while (current.location_type === 'item') {
      const parent = assetById.get(current.location_id)
      if (!parent) break
      current = parent.asset
    }
    return {
      locationId: current.location_id,
      locationType: current.location_type,
      rootItemId: current !== asset ? current.item_id : undefined,
    }
  }

  // Filter assets based on mode, deduplicating by item_id
  // (same asset may be visible to both character and corporation)
  const filteredAssets: AssetWithOwner[] = []
  const seenItemIds = new Set<number>()
  for (const aw of assetsWithOwners) {
    if (seenItemIds.has(aw.asset.item_id)) continue

    const type = getType(aw.asset.type_id)

    if (shouldIncludeAsset(aw.asset, type, mode, assetById)) {
      filteredAssets.push(aw)
      seenItemIds.add(aw.asset.item_id)
    }
  }

  // Build region -> system -> station -> items hierarchy
  const regionNodes = new Map<string, TreeNode>()
  // Track items that have been added to the tree (to prevent duplicates)
  const addedItemIds = new Set<number>()

  for (const aw of filteredAssets) {
    const { asset, owner } = aw

    // Skip if this item was already added to the tree (e.g., as a parent node)
    if (addedItemIds.has(asset.item_id)) continue

    const type = getType(asset.type_id)
    const root = getRootLocation(asset)

    // Resolve location info
    let locationName: string
    let systemName = ''
    let systemId: number | undefined
    let regionName = ''
    let regionId: number | undefined
    let stationLocationId: number

    if (root.locationId > 1_000_000_000_000) {
      // Player structure - location_id is the structure's ID
      stationLocationId = root.locationId
      const structure = getStructure(root.locationId)
      locationName = structure?.name ?? `Structure ${root.locationId}`
      if (structure?.solarSystemId) {
        const system = getLocation(structure.solarSystemId)
        systemName = system?.name ?? `System ${structure.solarSystemId}`
        systemId = structure.solarSystemId
        regionName = system?.regionName ?? ''
        regionId = system?.regionId
      }
    } else if (root.locationType === 'solar_system') {
      // Asset directly in space or inside a deployed structure
      const rootAsset = root.rootItemId ? assetById.get(root.rootItemId)?.asset : undefined
      const rootType = rootAsset ? getType(rootAsset.type_id) : undefined
      const isInsideDeployedStructure = rootType?.categoryId === CategoryIds.STRUCTURE

      if (type?.categoryId === CategoryIds.STRUCTURE) {
        // Current asset IS a deployed structure
        stationLocationId = asset.item_id
        const structure = getStructure(asset.item_id)
        locationName = structure?.name ?? `Structure ${asset.item_id}`
        if (structure?.solarSystemId) {
          const system = getLocation(structure.solarSystemId)
          systemName = system?.name ?? `System ${structure.solarSystemId}`
          systemId = structure.solarSystemId
          regionName = system?.regionName ?? ''
          regionId = system?.regionId
        }
      } else if (isInsideDeployedStructure && root.rootItemId) {
        // Current asset is INSIDE a deployed structure
        stationLocationId = root.rootItemId
        const structure = getStructure(root.rootItemId)
        locationName = structure?.name ?? `Structure ${root.rootItemId}`
        if (structure?.solarSystemId) {
          const system = getLocation(structure.solarSystemId)
          systemName = system?.name ?? `System ${structure.solarSystemId}`
          systemId = structure.solarSystemId
          regionName = system?.regionName ?? ''
          regionId = system?.regionId
        }
      } else {
        // Non-structure asset in space
        stationLocationId = root.locationId
        const system = getLocation(root.locationId)
        locationName = system?.name ?? `System ${root.locationId}`
        systemName = system?.name ?? ''
        systemId = root.locationId
        regionName = system?.regionName ?? ''
        regionId = system?.regionId
      }
    } else {
      // NPC station
      stationLocationId = root.locationId
      const location = getLocation(root.locationId)
      locationName = location?.name ?? `Location ${root.locationId}`
      systemName = location?.solarSystemName ?? ''
      systemId = location?.solarSystemId
      regionName = location?.regionName ?? ''
      regionId = location?.regionId
    }

    // Use "Unknown" for missing region/system
    if (!regionName) regionName = 'Unknown Region'
    if (!systemName) systemName = 'Unknown System'

    // Create or get region node
    const regionKey = regionId ? `region-${regionId}` : `region-${regionName}`
    let regionNode = regionNodes.get(regionKey)
    if (!regionNode) {
      regionNode = createLocationNode('region', regionKey, regionName, 0, {
        regionId,
        regionName,
      })
      regionNodes.set(regionKey, regionNode)
    }

    // Create or get system node
    const systemKey = systemId ? `system-${systemId}` : `system-${systemName}-${regionKey}`
    let systemNode = regionNode.children.find((n) => n.id === systemKey)
    if (!systemNode) {
      systemNode = createLocationNode('system', systemKey, systemName, 1, {
        regionId,
        regionName,
        systemId,
        systemName,
      })
      regionNode.children.push(systemNode)
    }

    // Create or get station node
    const stationKey = `station-${stationLocationId}`
    let stationNode = systemNode.children.find((n) => n.id === stationKey)
    if (!stationNode) {
      stationNode = createLocationNode('station', stationKey, locationName, 2, {
        locationId: stationLocationId,
        regionId,
        regionName,
        systemId,
        systemName,
      })
      systemNode.children.push(stationNode)
    }

    // Get the full parent chain (from immediate parent up to root container in hangar)
    // Filter out the deployed structure if it's being used as the station
    const rawParentChain = getParentChain(asset, assetById)
    const parentChain = rawParentChain.filter((p) => p.asset.item_id !== stationLocationId)

    // Find office info for division grouping BEFORE building the tree
    let officeIndex = -1
    let divisionFlag: string | undefined
    for (let i = 0; i < parentChain.length; i++) {
      if (isOffice(parentChain[i]!.asset.type_id)) {
        officeIndex = i
        if (i === 0) {
          divisionFlag = OFFICE_DIVISION_FLAGS.has(asset.location_flag) ? asset.location_flag : undefined
        } else {
          const childOfOffice = parentChain[i - 1]!
          divisionFlag = OFFICE_DIVISION_FLAGS.has(childOfOffice.asset.location_flag)
            ? childOfOffice.asset.location_flag
            : undefined
        }
        break
      }
    }

    // Build nested structure: station -> [parent chain with division inserted] -> item
    let currentParent: TreeNode = stationNode
    let currentDepth = 3
    let divisionInserted = false

    // Process parent chain in reverse (from outermost to innermost)
    for (let i = parentChain.length - 1; i >= 0; i--) {
      const parentAw = parentChain[i]!
      const parentType = getType(parentAw.asset.type_id)
      const parentNodeId = `asset-${parentAw.asset.item_id}`

      let parentNode = findNodeRecursive(currentParent.children, parentNodeId)

      if (!parentNode) {
        parentNode = createItemNode(
          parentAw.asset,
          parentAw.owner,
          parentType,
          prices,
          assetNames,
          currentDepth,
          locationName
        )
        currentParent.children.push(parentNode)
        addedItemIds.add(parentAw.asset.item_id)
      }

      currentParent = parentNode
      currentDepth = parentNode.depth + 1

      // Insert division node right after the office
      if (i === officeIndex && divisionFlag && !divisionInserted) {
        const divisionNodeId = `division-${parentAw.asset.item_id}-${divisionFlag}`
        let divisionNode = currentParent.children.find((n) => n.id === divisionNodeId)

        if (!divisionNode) {
          divisionNode = createDivisionNode(parentAw.asset.item_id, divisionFlag, currentDepth)
          currentParent.children.push(divisionNode)
        }

        currentParent = divisionNode
        currentDepth = divisionNode.depth + 1
        divisionInserted = true
      }
    }

    // Create and add the item node
    const itemNode = createItemNode(asset, owner, type, prices, assetNames, currentDepth, locationName)
    currentParent.children.push(itemNode)
    addedItemIds.add(asset.item_id)
  }

  // Recursively stack identical items at each level
  const stackRecursive = (nodes: TreeNode[]): TreeNode[] => {
    const stacked = stackIdenticalItems(nodes)
    for (const node of stacked) {
      if (node.children.length > 0) {
        node.children = stackRecursive(node.children)
      }
    }
    return stacked
  }

  for (const regionNode of regionNodes.values()) {
    for (const systemNode of regionNode.children) {
      for (const stationNode of systemNode.children) {
        stationNode.children = stackRecursive(stationNode.children)
      }
    }
  }

  // Sort and aggregate
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

  for (const regionNode of regionNodes.values()) {
    regionNode.children = sortRecursive(regionNode.children)
    aggregateTotals(regionNode)
  }

  // Return sorted region nodes
  return sortNodes(Array.from(regionNodes.values()))
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

export function filterTree(nodes: TreeNode[], search: string): TreeNode[] {
  if (!search) return nodes

  const searchLower = search.toLowerCase()
  const result: TreeNode[] = []

  for (const node of nodes) {
    const filteredChildren = filterTree(node.children, search)
    const selfMatches = nodeMatchesSearch(node, searchLower)

    if (selfMatches || filteredChildren.length > 0) {
      const filteredNode: TreeNode = {
        ...node,
        children: selfMatches ? node.children : filteredChildren,
      }
      result.push(filteredNode)
    }
  }

  return result
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
