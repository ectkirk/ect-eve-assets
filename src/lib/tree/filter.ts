import type { TreeNode } from '../tree-types'
import { matchesSearchLower } from '../utils'
import { aggregateTotals } from './node-factory'

function nodeMatchesSearch(node: TreeNode, searchLower: string): boolean {
  return matchesSearchLower(
    searchLower,
    node.name,
    node.typeName,
    node.groupName,
    node.regionName,
    node.systemName
  )
}

function nodeMatchesCategory(node: TreeNode, category: string): boolean {
  if (node.categoryName === category) return true
  return false
}

function filterTreeRecursive(
  nodes: TreeNode[],
  searchLower: string,
  category?: string
): TreeNode[] {
  const result: TreeNode[] = []

  for (const node of nodes) {
    const filteredChildren = filterTreeRecursive(
      node.children,
      searchLower,
      category
    )
    const selfMatchesSearch =
      !searchLower || nodeMatchesSearch(node, searchLower)
    const selfMatchesCategory = !category || nodeMatchesCategory(node, category)
    const selfMatches = selfMatchesSearch && selfMatchesCategory

    if (selfMatches || filteredChildren.length > 0) {
      const filteredNode: TreeNode = {
        ...node,
        children: selfMatches
          ? filterTreeRecursive(node.children, searchLower, category)
          : filteredChildren,
      }
      result.push(filteredNode)
    }
  }

  return result
}

export function filterTree(
  nodes: TreeNode[],
  search: string,
  category?: string
): TreeNode[] {
  if (!search && !category) return nodes

  const filtered = filterTreeRecursive(nodes, search.toLowerCase(), category)

  for (const node of filtered) {
    aggregateTotals(node)
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
