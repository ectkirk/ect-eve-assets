import type { TreeNode } from '../tree-types'

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

export function collectDescendantItems(node: TreeNode): TreeNode[] {
  const items: TreeNode[] = []
  const stack = [...node.children]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.nodeType === 'item' || current.nodeType === 'ship') {
      items.push(current)
    }
    stack.push(...current.children)
  }
  return items
}

export function getAllNodeIds(
  nodes: TreeNode[],
  result: string[] = []
): string[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      result.push(node.id)
      getAllNodeIds(node.children, result)
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
