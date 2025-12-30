import { memo, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TypeIcon } from '@/components/ui/type-icon'
import type {
  CachedCategory,
  CachedGroup,
  CachedType,
} from '@/store/reference-cache'

interface CategoryGroupTreeProps {
  categories: Map<number, CachedCategory>
  groups: Map<number, CachedGroup>
  types: Map<number, CachedType>
  expandedCategoryIds: Set<number>
  expandedGroupIds: Set<number>
  selectedCategoryId: number | null
  selectedGroupId: number | null
  selectedTypeId: number | null
  showUnpublished: boolean
  onToggleCategory: (categoryId: number) => void
  onToggleGroup: (groupId: number) => void
  onSelectCategory: (categoryId: number) => void
  onSelectGroup: (groupId: number) => void
  onSelectType: (typeId: number) => void
}

type FlatRow =
  | { kind: 'category'; category: CachedCategory; depth: 0 }
  | { kind: 'group'; group: CachedGroup; depth: 1 }
  | { kind: 'type'; type: CachedType; depth: 2 }

const ROW_HEIGHT = 28
const INDENT_CATEGORY = 8
const INDENT_GROUP = 24
const INDENT_TYPE = 48

interface SortedData {
  sortedCategories: CachedCategory[]
  groupsByCategory: Map<number, CachedGroup[]>
  typesByGroup: Map<number, CachedType[]>
}

function buildSortedData(
  categories: Map<number, CachedCategory>,
  groups: Map<number, CachedGroup>,
  types: Map<number, CachedType>,
  showUnpublished: boolean
): SortedData {
  const sortedCategories = Array.from(categories.values())
    .filter((c) => showUnpublished || c.published !== false)
    .sort((a, b) => a.name.localeCompare(b.name))

  const groupsByCategory = new Map<number, CachedGroup[]>()
  for (const group of groups.values()) {
    if (!showUnpublished && group.published === false) continue
    const list = groupsByCategory.get(group.categoryId) || []
    list.push(group)
    groupsByCategory.set(group.categoryId, list)
  }
  for (const list of groupsByCategory.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  const typesByGroup = new Map<number, CachedType[]>()
  for (const type of types.values()) {
    if (!showUnpublished && type.published === false) continue
    const list = typesByGroup.get(type.groupId) || []
    list.push(type)
    typesByGroup.set(type.groupId, list)
  }
  for (const list of typesByGroup.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }

  return { sortedCategories, groupsByCategory, typesByGroup }
}

function buildFlatRows(
  sortedData: SortedData,
  expandedCategoryIds: Set<number>,
  expandedGroupIds: Set<number>
): FlatRow[] {
  const { sortedCategories, groupsByCategory, typesByGroup } = sortedData
  const rows: FlatRow[] = []

  for (const category of sortedCategories) {
    rows.push({ kind: 'category', category, depth: 0 })

    if (expandedCategoryIds.has(category.id)) {
      const catGroups = groupsByCategory.get(category.id) || []
      for (const group of catGroups) {
        rows.push({ kind: 'group', group, depth: 1 })

        if (expandedGroupIds.has(group.id)) {
          const groupTypes = typesByGroup.get(group.id) || []
          for (const type of groupTypes) {
            rows.push({ kind: 'type', type, depth: 2 })
          }
        }
      }
    }
  }

  return rows
}

const FOLDER_COLORS = {
  category: 'text-accent',
  group: 'text-category-amber',
} as const

const FolderRow = memo(function FolderRow({
  name,
  isExpanded,
  isSelected,
  isUnpublished,
  hasChildren,
  paddingLeft,
  folderColor,
  onToggle,
  onSelect,
}: {
  name: string
  isExpanded: boolean
  isSelected: boolean
  isUnpublished: boolean
  hasChildren: boolean
  paddingLeft: number
  folderColor: string
  onToggle: () => void
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 cursor-pointer hover:bg-surface-tertiary',
        isSelected && 'bg-accent/20',
        isUnpublished && 'opacity-60'
      )}
      style={{ height: ROW_HEIGHT, paddingLeft }}
      onClick={() => {
        onToggle()
        onSelect()
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className="p-0.5 hover:bg-surface-secondary rounded flex-shrink-0"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-content-secondary" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-content-secondary" />
        )}
      </button>
      {hasChildren ? (
        isExpanded ? (
          <FolderOpen className={`h-4 w-4 ${folderColor} flex-shrink-0`} />
        ) : (
          <Folder className={`h-4 w-4 ${folderColor} flex-shrink-0`} />
        )
      ) : (
        <Folder className="h-4 w-4 text-content-secondary flex-shrink-0" />
      )}
      <span
        className={cn(
          'text-sm truncate min-w-0',
          isSelected && 'text-accent font-medium',
          isUnpublished && 'italic'
        )}
        title={name}
      >
        {name}
      </span>
    </div>
  )
})

const TypeRow = memo(function TypeRow({
  type,
  isSelected,
  onSelect,
}: {
  type: CachedType
  isSelected: boolean
  onSelect: () => void
}) {
  const isUnpublished = type.published === false
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 cursor-pointer hover:bg-surface-tertiary',
        isSelected && 'bg-accent/20',
        isUnpublished && 'opacity-60'
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: INDENT_TYPE }}
      onClick={onSelect}
    >
      <TypeIcon typeId={type.id} categoryId={type.categoryId} size="sm" />
      <span
        className={cn(
          'text-sm truncate min-w-0',
          isSelected && 'text-accent font-medium',
          isUnpublished && 'italic'
        )}
        title={type.name}
      >
        {type.name}
      </span>
    </div>
  )
})

export function CategoryGroupTree({
  categories,
  groups,
  types,
  expandedCategoryIds,
  expandedGroupIds,
  selectedCategoryId,
  selectedGroupId,
  selectedTypeId,
  showUnpublished,
  onToggleCategory,
  onToggleGroup,
  onSelectCategory,
  onSelectGroup,
  onSelectType,
}: CategoryGroupTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const typeCountsByGroup = useMemo(() => {
    const map = new Map<number, number>()
    for (const type of types.values()) {
      if (!showUnpublished && type.published === false) continue
      map.set(type.groupId, (map.get(type.groupId) || 0) + 1)
    }
    return map
  }, [types, showUnpublished])

  const groupCountsByCategory = useMemo(() => {
    const map = new Map<number, number>()
    for (const group of groups.values()) {
      if (!showUnpublished && group.published === false) continue
      map.set(group.categoryId, (map.get(group.categoryId) || 0) + 1)
    }
    return map
  }, [groups, showUnpublished])

  const sortedData = useMemo(
    () => buildSortedData(categories, groups, types, showUnpublished),
    [categories, groups, types, showUnpublished]
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
                isSelected={selectedCategoryId === row.category.id}
                isUnpublished={row.category.published === false}
                hasChildren={
                  (groupCountsByCategory.get(row.category.id) || 0) > 0
                }
                paddingLeft={INDENT_CATEGORY}
                folderColor={FOLDER_COLORS.category}
                onToggle={() => onToggleCategory(row.category.id)}
                onSelect={() => onSelectCategory(row.category.id)}
              />
            )
          } else if (row.kind === 'group') {
            key = `g-${row.group.id}`
            content = (
              <FolderRow
                name={row.group.name}
                isExpanded={expandedGroupIds.has(row.group.id)}
                isSelected={selectedGroupId === row.group.id}
                isUnpublished={row.group.published === false}
                hasChildren={(typeCountsByGroup.get(row.group.id) || 0) > 0}
                paddingLeft={INDENT_GROUP}
                folderColor={FOLDER_COLORS.group}
                onToggle={() => onToggleGroup(row.group.id)}
                onSelect={() => onSelectGroup(row.group.id)}
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
