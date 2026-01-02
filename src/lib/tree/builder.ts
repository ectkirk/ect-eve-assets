import { type ResolvedAsset, getAssetDisplayNames } from '../resolved-asset'
import {
  type TreeNode,
  type TreeNodeType,
  TreeMode,
  OFFICE_DIVISION_FLAGS,
} from '../tree-types'
import { getType } from '@/store/reference-cache'
import {
  isShip,
  isOffice,
  createItemNode,
  createDivisionNode,
  createLocationNode,
  aggregateTotals,
  stackIdenticalItems,
} from './node-factory'
import type { ESIAsset } from '@/api/endpoints/assets'

interface OfficeInfo {
  index: number
  divisionFlag: string | undefined
}

function findOfficeInChain(
  parentChain: ESIAsset[],
  currentAsset: { location_flag: string }
): OfficeInfo | null {
  for (let i = 0; i < parentChain.length; i++) {
    const parent = parentChain[i]
    if (!parent || !isOffice(parent.type_id)) continue

    const flagSource = i === 0 ? currentAsset : parentChain[i - 1]
    const flag = flagSource?.location_flag
    const divisionFlag =
      flag && OFFICE_DIVISION_FLAGS.has(flag) ? flag : undefined

    return { index: i, divisionFlag }
  }
  return null
}

export interface TreeBuilderOptions {
  mode: TreeMode
  hangarDivisionNames?: Map<number, string>
}

export function shouldIncludeByMode(
  ra: ResolvedAsset,
  mode: TreeMode
): boolean {
  const mf = ra.modeFlags

  switch (mode) {
    case TreeMode.ALL:
      return true
    case TreeMode.ACTIVE_SHIP:
      return mf.isActiveShip
    case TreeMode.ITEM_HANGAR:
      return (
        mf.inItemHangar &&
        !mf.isContract &&
        !mf.isMarketOrder &&
        !mf.isIndustryJob
      )
    case TreeMode.SHIP_HANGAR:
      return (
        mf.inShipHangar &&
        !mf.isContract &&
        !mf.isMarketOrder &&
        !mf.isIndustryJob
      )
    case TreeMode.DELIVERIES:
      return mf.inDeliveries
    case TreeMode.ASSET_SAFETY:
      return mf.inAssetSafety
    case TreeMode.OFFICE:
      return (
        mf.inOffice && !mf.isContract && !mf.isMarketOrder && !mf.isIndustryJob
      )
    case TreeMode.STRUCTURES:
      return mf.isOwnedStructure
    case TreeMode.CONTRACTS:
      return mf.isContract
    case TreeMode.MARKET_ORDERS:
      return mf.isMarketOrder
    case TreeMode.INDUSTRY_JOBS:
      return mf.isIndustryJob
    case TreeMode.CLONES:
      return false
    default:
      return true
  }
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
  const nodeIndex = new Map<string, TreeNode>()
  const addedItemIds = new Set<number>()

  for (const ra of filteredAssets) {
    if (addedItemIds.has(ra.asset.item_id)) continue

    const names = getAssetDisplayNames(ra)
    const stationKey = `station-${ra.rootLocationId}`
    let stationNode = stationNodes.get(stationKey)
    if (!stationNode) {
      stationNode = createLocationNode(
        'station',
        stationKey,
        names.locationName,
        0,
        {
          locationId: ra.rootLocationId,
          regionId: ra.regionId,
          regionName: names.regionName,
          systemId: ra.systemId,
          systemName: names.systemName,
        }
      )
      stationNodes.set(stationKey, stationNode)
    }

    // Filter out the root structure if it appears in the chain (for owned structures where
    // rootLocationId is the structure's item_id). For stations, rootLocationId is a station
    // ID which won't match any asset's item_id.
    const parentChain = ra.parentChain.filter(
      (p) => p.item_id !== ra.rootLocationId
    )

    const officeInfo = findOfficeInChain(parentChain, ra.asset)
    const officeIndex = officeInfo?.index ?? -1
    const divisionFlag = officeInfo?.divisionFlag

    let currentParent: TreeNode = stationNode
    let currentDepth = 1
    let divisionInserted = false

    for (let i = parentChain.length - 1; i >= 0; i--) {
      const parentAsset = parentChain[i]!
      const parentResolved = itemIdToResolved.get(parentAsset.item_id)
      const parentNodeId = `asset-${parentAsset.item_id}`

      let parentNode = nodeIndex.get(parentNodeId)

      if (!parentNode && parentResolved) {
        parentNode = createItemNode(
          parentResolved,
          currentDepth,
          names.locationName
        )
        currentParent.children.push(parentNode)
        nodeIndex.set(parentNodeId, parentNode)
        addedItemIds.add(parentAsset.item_id)
      } else if (!parentNode) {
        const parentType = getType(parentAsset.type_id)
        let pNodeType: TreeNodeType = 'item'
        if (isOffice(parentAsset.type_id)) {
          pNodeType = 'office'
        } else if (isShip(parentType)) {
          pNodeType = 'ship'
        }

        parentNode = {
          id: parentNodeId,
          nodeType: pNodeType,
          name:
            pNodeType === 'office'
              ? names.locationName
              : (parentType?.name ?? `Unknown ${parentAsset.type_id}`),
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
        nodeIndex.set(parentNodeId, parentNode)
        addedItemIds.add(parentAsset.item_id)
      }

      currentParent = parentNode
      currentDepth = parentNode.depth + 1

      if (i === officeIndex && divisionFlag && !divisionInserted) {
        const divisionNodeId = `division-${parentAsset.item_id}-${divisionFlag}`
        let divisionNode = nodeIndex.get(divisionNodeId)

        if (!divisionNode) {
          divisionNode = createDivisionNode(
            parentAsset.item_id,
            divisionFlag,
            currentDepth,
            hangarDivisionNames
          )
          currentParent.children.push(divisionNode)
          nodeIndex.set(divisionNodeId, divisionNode)
        }

        currentParent = divisionNode
        currentDepth = divisionNode.depth + 1
        divisionInserted = true
      }
    }

    const itemNode = createItemNode(ra, currentDepth, names.locationName)
    currentParent.children.push(itemNode)
    nodeIndex.set(itemNode.id, itemNode)
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
