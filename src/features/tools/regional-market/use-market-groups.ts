import { useState, useEffect, useMemo } from 'react'
import type { CachedType } from '@/store/reference-cache'
import type { MarketGroup, MarketGroupNode, TreeRow } from './types'

interface UseMarketGroupsResult {
  tree: MarketGroupNode[]
  loading: boolean
  error: string | null
}

function buildTree(groups: Map<number, MarketGroup>): MarketGroupNode[] {
  const childrenMap = new Map<number | null, MarketGroup[]>()

  for (const group of groups.values()) {
    const parentId = group.parentGroupId
    const siblings = childrenMap.get(parentId) ?? []
    siblings.push(group)
    childrenMap.set(parentId, siblings)
  }

  function buildNode(group: MarketGroup, depth: number): MarketGroupNode {
    const children = childrenMap.get(group.id) ?? []
    children.sort((a, b) => a.name.localeCompare(b.name))

    return {
      group,
      depth,
      children: children.map((child) => buildNode(child, depth + 1)),
    }
  }

  const rootGroups = childrenMap.get(null) ?? []
  rootGroups.sort((a, b) => a.name.localeCompare(b.name))

  return rootGroups.map((group) => buildNode(group, 0))
}

export function useMarketGroups(): UseMarketGroupsResult {
  const [groups, setGroups] = useState<Map<number, MarketGroup> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await window.electronAPI!.refMarketGroups()
        if (cancelled) return

        if (result.error) {
          setError(result.error)
          setLoading(false)
          return
        }

        if (result.items) {
          const map = new Map<number, MarketGroup>()
          for (const [key, value] of Object.entries(result.items)) {
            map.set(parseInt(key, 10), value)
          }
          setGroups(map)
        }
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : 'Failed to load market groups'
        )
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const tree = useMemo(() => {
    if (!groups) return []
    return buildTree(groups)
  }, [groups])

  return { tree, loading, error }
}

export function flattenTreeWithItems(
  nodes: MarketGroupNode[],
  expandedIds: Set<number>,
  types: Map<number, CachedType>
): TreeRow[] {
  const result: TreeRow[] = []

  const typesByMarketGroup = new Map<number, CachedType[]>()
  for (const type of types.values()) {
    if (type.marketGroupId) {
      const list = typesByMarketGroup.get(type.marketGroupId) ?? []
      list.push(type)
      typesByMarketGroup.set(type.marketGroupId, list)
    }
  }

  for (const list of typesByMarketGroup.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  function traverse(node: MarketGroupNode) {
    const isLeaf = node.children.length === 0
    const hasItems = typesByMarketGroup.has(node.group.id)

    result.push({ kind: 'group', node })

    if (expandedIds.has(node.group.id)) {
      for (const child of node.children) {
        traverse(child)
      }

      if (isLeaf && hasItems) {
        const items = typesByMarketGroup.get(node.group.id)!
        for (const type of items) {
          result.push({
            kind: 'item',
            type,
            depth: node.depth + 1,
            parentGroupId: node.group.id,
          })
        }
      }
    }
  }

  for (const node of nodes) {
    traverse(node)
  }

  return result
}

export function getAllGroupIds(nodes: MarketGroupNode[]): number[] {
  const ids: number[] = []

  function traverse(node: MarketGroupNode) {
    if (node.children.length > 0) {
      ids.push(node.group.id)
      for (const child of node.children) {
        traverse(child)
      }
    }
  }

  for (const node of nodes) {
    traverse(node)
  }

  return ids
}

export function getDescendantMarketGroupIds(
  node: MarketGroupNode,
  includeParent = true
): number[] {
  const ids: number[] = includeParent ? [node.group.id] : []

  function traverse(n: MarketGroupNode) {
    for (const child of n.children) {
      ids.push(child.group.id)
      traverse(child)
    }
  }

  traverse(node)
  return ids
}
