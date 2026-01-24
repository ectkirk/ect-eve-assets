import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type {
  CachedCategory,
  CachedGroup,
  CachedType,
} from '@/store/reference-cache'
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

const BLUEPRINT_CATEGORY_ID = 9

interface BlueprintTreeProps {
  groups: Map<number, CachedGroup>
  types: Map<number, CachedType>
  expandedCategoryIds: Set<number>
  expandedGroupIds: Set<number>
  selectedTypeId: number | null
  onToggleCategory: (categoryId: number) => void
  onToggleGroup: (groupId: number) => void
  onSelectType: (typeId: number) => void
}

interface FilteredData {
  filteredTypes: Map<number, CachedType>
  groupsWithTypes: Set<number>
}

function filterBlueprintTypes(types: Map<number, CachedType>): FilteredData {
  const filteredTypes = new Map<number, CachedType>()
  const groupsWithTypes = new Set<number>()

  for (const type of types.values()) {
    if (type.published === false) continue
    if (type.categoryId !== BLUEPRINT_CATEGORY_ID) continue

    filteredTypes.set(type.id, type)
    groupsWithTypes.add(type.groupId)
  }

  return { filteredTypes, groupsWithTypes }
}

function buildSortedData(
  groups: Map<number, CachedGroup>,
  filteredData: FilteredData
): SortedData {
  const { filteredTypes, groupsWithTypes } = filteredData

  const blueprintCategory: CachedCategory = {
    id: BLUEPRINT_CATEGORY_ID,
    name: 'Blueprint',
    published: true,
  }
  const sortedCategories = [blueprintCategory]

  const groupsByCategory = new Map<number, CachedGroup[]>()
  const groupList: CachedGroup[] = []
  for (const group of groups.values()) {
    if (group.published === false) continue
    if (group.categoryId !== BLUEPRINT_CATEGORY_ID) continue
    if (!groupsWithTypes.has(group.id)) continue
    groupList.push(group)
  }
  groupList.sort((a, b) => a.name.localeCompare(b.name))
  groupsByCategory.set(BLUEPRINT_CATEGORY_ID, groupList)

  const typesByGroup = new Map<number, CachedType[]>()
  for (const type of filteredTypes.values()) {
    const list = typesByGroup.get(type.groupId) || []
    list.push(type)
    typesByGroup.set(type.groupId, list)
  }
  for (const list of typesByGroup.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  return { sortedCategories, groupsByCategory, typesByGroup }
}

export function BlueprintTree({
  groups,
  types,
  expandedCategoryIds,
  expandedGroupIds,
  selectedTypeId,
  onToggleCategory,
  onToggleGroup,
  onSelectType,
}: BlueprintTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const filteredData = useMemo(() => filterBlueprintTypes(types), [types])

  const typeCountsByGroup = useMemo(() => {
    const map = new Map<number, number>()
    for (const type of filteredData.filteredTypes.values()) {
      map.set(type.groupId, (map.get(type.groupId) || 0) + 1)
    }
    return map
  }, [filteredData])

  const groupCountsByCategory = useMemo(() => {
    const map = new Map<number, number>()
    for (const group of groups.values()) {
      if (group.published === false) continue
      if (group.categoryId !== BLUEPRINT_CATEGORY_ID) continue
      if (!filteredData.groupsWithTypes.has(group.id)) continue
      map.set(group.categoryId, (map.get(group.categoryId) || 0) + 1)
    }
    return map
  }, [groups, filteredData])

  const sortedData = useMemo(
    () => buildSortedData(groups, filteredData),
    [groups, filteredData]
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
