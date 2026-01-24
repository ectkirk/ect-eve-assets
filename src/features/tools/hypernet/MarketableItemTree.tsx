import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type {
  CachedCategory,
  CachedGroup,
  CachedType,
} from '@/store/reference-cache'
import type { EsiPriceData } from '@/store/price-store'
import {
  SortedData,
  ROW_HEIGHT,
  INDENT_CATEGORY,
  INDENT_GROUP,
  FOLDER_COLORS,
  buildFlatRows,
  FolderRow,
  TypeRow,
} from '../reference/tree-primitives'

interface MarketableItemTreeProps {
  categories: Map<number, CachedCategory>
  groups: Map<number, CachedGroup>
  types: Map<number, CachedType>
  esiPrices: Map<number, EsiPriceData>
  expandedCategoryIds: Set<number>
  expandedGroupIds: Set<number>
  selectedTypeId: number | null
  onToggleCategory: (categoryId: number) => void
  onToggleGroup: (groupId: number) => void
  onSelectType: (typeId: number) => void
}

interface FilteredData {
  typesWithPrice: Map<number, CachedType>
  groupsWithPricedTypes: Set<number>
  categoriesWithPricedTypes: Set<number>
}

function filterTypesWithAveragePrice(
  types: Map<number, CachedType>,
  esiPrices: Map<number, EsiPriceData>
): FilteredData {
  const typesWithPrice = new Map<number, CachedType>()
  const groupsWithPricedTypes = new Set<number>()
  const categoriesWithPricedTypes = new Set<number>()

  for (const type of types.values()) {
    if (type.published === false) continue
    const priceData = esiPrices.get(type.id)
    if (priceData?.average == null) continue

    typesWithPrice.set(type.id, type)
    groupsWithPricedTypes.add(type.groupId)
    categoriesWithPricedTypes.add(type.categoryId)
  }

  return {
    typesWithPrice,
    groupsWithPricedTypes,
    categoriesWithPricedTypes,
  }
}

function buildSortedData(
  categories: Map<number, CachedCategory>,
  groups: Map<number, CachedGroup>,
  filteredData: FilteredData
): SortedData {
  const { typesWithPrice, groupsWithPricedTypes, categoriesWithPricedTypes } =
    filteredData

  const sortedCategories = Array.from(categories.values())
    .filter((c) => c.published !== false && categoriesWithPricedTypes.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const groupsByCategory = new Map<number, CachedGroup[]>()
  for (const group of groups.values()) {
    if (group.published === false) continue
    if (!groupsWithPricedTypes.has(group.id)) continue
    const list = groupsByCategory.get(group.categoryId) || []
    list.push(group)
    groupsByCategory.set(group.categoryId, list)
  }
  for (const list of groupsByCategory.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  const typesByGroup = new Map<number, CachedType[]>()
  for (const type of typesWithPrice.values()) {
    const list = typesByGroup.get(type.groupId) || []
    list.push(type)
    typesByGroup.set(type.groupId, list)
  }
  for (const list of typesByGroup.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  return { sortedCategories, groupsByCategory, typesByGroup }
}

export function MarketableItemTree({
  categories,
  groups,
  types,
  esiPrices,
  expandedCategoryIds,
  expandedGroupIds,
  selectedTypeId,
  onToggleCategory,
  onToggleGroup,
  onSelectType,
}: MarketableItemTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredData = useMemo(
    () => filterTypesWithAveragePrice(types, esiPrices),
    [types, esiPrices]
  )

  const typeCountsByGroup = useMemo(() => {
    const map = new Map<number, number>()
    for (const type of filteredData.typesWithPrice.values()) {
      map.set(type.groupId, (map.get(type.groupId) || 0) + 1)
    }
    return map
  }, [filteredData])

  const groupCountsByCategory = useMemo(() => {
    const map = new Map<number, number>()
    for (const group of groups.values()) {
      if (group.published === false) continue
      if (!filteredData.groupsWithPricedTypes.has(group.id)) continue
      map.set(group.categoryId, (map.get(group.categoryId) || 0) + 1)
    }
    return map
  }, [groups, filteredData])

  const sortedData = useMemo(
    () => buildSortedData(categories, groups, filteredData),
    [categories, groups, filteredData]
  )

  const flatRows = useMemo(
    () => buildFlatRows(sortedData, expandedCategoryIds, expandedGroupIds),
    [sortedData, expandedCategoryIds, expandedGroupIds]
  )

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualRows.map((virtualRow) => {
          const row = flatRows[virtualRow.index]
          if (!row) return null

          let key: string
          let content: React.ReactNode

          if (row.kind === 'category') {
            key = `c-${row.category.id}`
            content = (
              <FolderRow
                name={row.category.name}
                isExpanded={expandedCategoryIds.has(row.category.id)}
                hasChildren={
                  (groupCountsByCategory.get(row.category.id) || 0) > 0
                }
                paddingLeft={INDENT_CATEGORY}
                folderColor={FOLDER_COLORS.category}
                onToggle={() => onToggleCategory(row.category.id)}
              />
            )
          } else if (row.kind === 'group') {
            key = `g-${row.group.id}`
            content = (
              <FolderRow
                name={row.group.name}
                isExpanded={expandedGroupIds.has(row.group.id)}
                hasChildren={(typeCountsByGroup.get(row.group.id) || 0) > 0}
                paddingLeft={INDENT_GROUP}
                folderColor={FOLDER_COLORS.group}
                onToggle={() => onToggleGroup(row.group.id)}
              />
            )
          } else {
            key = `t-${row.type.id}`
            content = (
              <TypeRow
                type={row.type}
                isSelected={selectedTypeId === row.type.id}
                onSelect={() => onSelectType(row.type.id)}
              />
            )
          }

          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
