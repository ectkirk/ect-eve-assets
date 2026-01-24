import { memo } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TypeIcon } from '@/components/ui/type-icon'
import type {
  CachedCategory,
  CachedGroup,
  CachedType,
} from '@/store/reference-cache'

export type FlatRow =
  | { kind: 'category'; category: CachedCategory; depth: 0 }
  | { kind: 'group'; group: CachedGroup; depth: 1 }
  | { kind: 'type'; type: CachedType; depth: 2 }

export const ROW_HEIGHT = 28
export const INDENT_CATEGORY = 8
export const INDENT_GROUP = 24
export const INDENT_TYPE = 48

export const FOLDER_COLORS = {
  category: 'text-accent',
  group: 'text-category-amber',
} as const

export interface SortedData {
  sortedCategories: CachedCategory[]
  groupsByCategory: Map<number, CachedGroup[]>
  typesByGroup: Map<number, CachedType[]>
}

export function buildFlatRows(
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

export const FolderRow = memo(function FolderRow({
  name,
  isExpanded,
  isSelected = false,
  isUnpublished = false,
  hasChildren,
  paddingLeft,
  folderColor,
  onToggle,
  onSelect,
}: {
  name: string
  isExpanded: boolean
  isSelected?: boolean
  isUnpublished?: boolean
  hasChildren: boolean
  paddingLeft: number
  folderColor: string
  onToggle: () => void
  onSelect?: () => void
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
        onSelect?.()
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

export const TypeRow = memo(function TypeRow({
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
