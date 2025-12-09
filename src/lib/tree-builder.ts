import type { ESIAsset } from '@/api/endpoints/assets'
import type { Owner } from '@/store/auth-store'
import {
  type TreeNode,
  type TreeNodeType,
  TreeMode,
  CategoryIds,
  HANGAR_FLAGS,
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

function shouldIncludeAsset(
  asset: ESIAsset,
  type: CachedType | undefined,
  mode: TreeMode,
  _parentAsset?: ESIAsset,
  parentType?: CachedType
): boolean {
  const flag = asset.location_flag

  switch (mode) {
    case TreeMode.ITEM_HANGAR:
      // Items in hangars that are NOT ships, NOT offices, and NOT inside offices
      if (!HANGAR_FLAGS.has(flag)) return false
      if (isShip(type)) return false
      if (isOffice(asset.type_id)) return false
      if (parentType && isOffice(parentType.id)) return false
      return true

    case TreeMode.SHIP_HANGAR:
      // Ships in hangars only
      if (!HANGAR_FLAGS.has(flag)) return false
      return isShip(type)

    case TreeMode.DELIVERIES:
      return DELIVERY_FLAGS.has(flag)

    case TreeMode.ASSET_SAFETY:
      return ASSET_SAFETY_FLAGS.has(flag)

    case TreeMode.OFFICE:
      // Items inside Office containers (typeId 27), excluding deployed structures
      if (type?.categoryId === CategoryIds.STRUCTURE) return false
      if (parentType?.id === OFFICE_TYPE_ID) return true
      // Include Office containers, but exclude those inside deployed structures
      // (they will be created as parent nodes when processing their contents)
      if (type?.id === OFFICE_TYPE_ID) {
        return parentType?.categoryId !== CategoryIds.STRUCTURE
      }
      return false

    case TreeMode.STRUCTURES:
      // Deployed structures (category 65) in space
      return type?.categoryId === CategoryIds.STRUCTURE && asset.location_type === 'solar_system'

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

  let nodeType: TreeNodeType = 'item'
  let displayName = customName || type?.name || `Type ${asset.type_id}`

  if (isOffice(asset.type_id)) {
    nodeType = 'office'
    // Name office after the station/structure it's in
    displayName = stationName ? `Office @ ${stationName}` : 'Office'
  } else if (isShip(type)) {
    nodeType = 'ship'
  } else if (isContainer(type)) {
    nodeType = 'container'
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

  // Find parent chain for each asset
  const getParentAsset = (asset: ESIAsset): AssetWithOwner | undefined => {
    if (asset.location_type === 'item') {
      return assetById.get(asset.location_id)
    }
    return undefined
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
    const parent = getParentAsset(aw.asset)
    const parentType = parent ? getType(parent.asset.type_id) : undefined

    if (shouldIncludeAsset(aw.asset, type, mode, parent?.asset, parentType)) {
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

    // Create item node
    const itemNode = createItemNode(asset, owner, type, prices, assetNames, 3, locationName)

    // Handle nested items (inside containers/ships/offices)
    if (asset.location_type === 'item') {
      const parentAw = assetById.get(asset.location_id)
      if (parentAw) {
        const parentType = getType(parentAw.asset.type_id)
        const parentIsOffice = isOffice(parentAw.asset.type_id)

        // Find or create parent container/office node in station
        const parentNodeId = `asset-${parentAw.asset.item_id}`
        let parentNode = stationNode.children.find((n) => n.id === parentNodeId)

        if (!parentNode) {
          parentNode = createItemNode(
            parentAw.asset,
            parentAw.owner,
            parentType,
            prices,
            assetNames,
            3,
            locationName
          )
          stationNode.children.push(parentNode)
          addedItemIds.add(parentAw.asset.item_id)
        }

        // If parent is an office and item has a division flag, group by division
        if (parentIsOffice && OFFICE_DIVISION_FLAGS.has(asset.location_flag)) {
          const divisionNodeId = `division-${parentAw.asset.item_id}-${asset.location_flag}`
          let divisionNode = parentNode.children.find((n) => n.id === divisionNodeId)

          if (!divisionNode) {
            divisionNode = createDivisionNode(parentAw.asset.item_id, asset.location_flag, 4)
            parentNode.children.push(divisionNode)
          }

          itemNode.depth = 5
          divisionNode.children.push(itemNode)
          addedItemIds.add(asset.item_id)
        } else {
          itemNode.depth = 4
          parentNode.children.push(itemNode)
          addedItemIds.add(asset.item_id)
        }
        continue
      }
    }

    // Add directly to station
    stationNode.children.push(itemNode)
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
