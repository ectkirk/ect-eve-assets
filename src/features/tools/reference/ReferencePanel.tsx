import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  lazy,
  Suspense,
  useRef,
} from 'react'
import { ChevronRight, Loader2, Search, X } from 'lucide-react'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { TypeIcon } from '@/components/ui/type-icon'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { loadReferenceData } from '@/api/ref-data-loader'
import { useDebouncedValue } from '@/hooks'
import { CategoryGroupTree } from './CategoryGroupTree'

const SEARCH_DEBOUNCE_MS = 150
const SEARCH_LIMIT_CATEGORIES = 5
const SEARCH_LIMIT_GROUPS = 10
const SEARCH_LIMIT_TYPES = 20

const ItemDetailPanel = lazy(() =>
  import('./ItemDetailPanel').then((m) => ({ default: m.ItemDetailPanel }))
)

interface ReferencePanelProps {
  initialTypeId?: number | null
  onClearInitialTypeId?: () => void
}

export function ReferencePanel({
  initialTypeId,
  onClearInitialTypeId,
}: ReferencePanelProps = {}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showUnpublished, setShowUnpublished] = useState(false)
  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(
    new Set()
  )
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(
    new Set()
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  )
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)

  const categories = useReferenceCacheStore((s) => s.categories)
  const groups = useReferenceCacheStore((s) => s.groups)
  const types = useReferenceCacheStore((s) => s.types)
  const allTypesLoaded = useReferenceCacheStore((s) => s.allTypesLoaded)
  const [loadingTypes, setLoadingTypes] = useState(false)

  const handleLoadAllTypes = useCallback(async () => {
    if (loadingTypes) return
    setLoadingTypes(true)
    await loadReferenceData()
    setLoadingTypes(false)
  }, [loadingTypes])

  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) return null

    const query = debouncedQuery.toLowerCase()
    const matchedCategories: {
      id: number
      name: string
      published?: boolean
    }[] = []
    const matchedGroups: {
      id: number
      name: string
      categoryName: string
      published?: boolean
    }[] = []
    const matchedTypes: {
      id: number
      name: string
      groupName: string
      categoryId: number
      categoryName: string
      published?: boolean
    }[] = []

    for (const cat of categories.values()) {
      if (!showUnpublished && cat.published === false) continue
      if (cat.name.toLowerCase().includes(query)) {
        matchedCategories.push({
          id: cat.id,
          name: cat.name,
          published: cat.published,
        })
        if (matchedCategories.length >= SEARCH_LIMIT_CATEGORIES) break
      }
    }

    for (const grp of groups.values()) {
      if (!showUnpublished && grp.published === false) continue
      if (grp.name.toLowerCase().includes(query)) {
        const cat = categories.get(grp.categoryId)
        matchedGroups.push({
          id: grp.id,
          name: grp.name,
          categoryName: cat?.name ?? 'Unknown',
          published: grp.published,
        })
        if (matchedGroups.length >= SEARCH_LIMIT_GROUPS) break
      }
    }

    if (allTypesLoaded) {
      for (const type of types.values()) {
        if (!showUnpublished && type.published === false) continue
        if (type.name.toLowerCase().includes(query)) {
          matchedTypes.push({
            id: type.id,
            name: type.name,
            groupName: type.groupName,
            categoryId: type.categoryId,
            categoryName: type.categoryName,
            published: type.published,
          })
          if (matchedTypes.length >= SEARCH_LIMIT_TYPES) break
        }
      }
    }

    return {
      categories: matchedCategories,
      groups: matchedGroups,
      types: matchedTypes,
    }
  }, [
    debouncedQuery,
    categories,
    groups,
    types,
    allTypesLoaded,
    showUnpublished,
  ])

  const handleToggleCategory = useCallback((categoryId: number) => {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }, [])

  const handleToggleGroup = useCallback((groupId: number) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])

  const handleSelectCategory = useCallback((categoryId: number) => {
    setSelectedCategoryId(categoryId)
    setSelectedGroupId(null)
    setSelectedTypeId(null)
  }, [])

  const handleSelectGroup = useCallback(
    (groupId: number) => {
      const group = groups.get(groupId)
      if (group) {
        setSelectedCategoryId(group.categoryId)
      }
      setSelectedGroupId(groupId)
      setSelectedTypeId(null)
    },
    [groups]
  )

  const handleSelectType = useCallback(
    (typeId: number) => {
      const type = types.get(typeId)
      if (type) {
        setSelectedCategoryId(type.categoryId)
        setSelectedGroupId(type.groupId)
        setExpandedCategoryIds((prev) => new Set([...prev, type.categoryId]))
        setExpandedGroupIds((prev) => new Set([...prev, type.groupId]))
      }
      setSelectedTypeId(typeId)
      setSearchQuery('')
      setDropdownOpen(false)
    },
    [types]
  )

  const lastHandledTypeId = useRef<number | null>(null)
  useEffect(() => {
    if (!initialTypeId) return
    if (lastHandledTypeId.current === initialTypeId) return
    lastHandledTypeId.current = initialTypeId

    queueMicrotask(() => {
      handleSelectType(initialTypeId)
      onClearInitialTypeId?.()
    })
  }, [initialTypeId, handleSelectType, onClearInitialTypeId])

  const handleSearchCategoryClick = useCallback(
    (categoryId: number) => {
      setExpandedCategoryIds((prev) => new Set([...prev, categoryId]))
      handleSelectCategory(categoryId)
      setSearchQuery('')
      setDropdownOpen(false)
    },
    [handleSelectCategory]
  )

  const handleSearchGroupClick = useCallback(
    (groupId: number) => {
      const group = groups.get(groupId)
      if (group) {
        setExpandedCategoryIds((prev) => new Set([...prev, group.categoryId]))
        setExpandedGroupIds((prev) => new Set([...prev, groupId]))
      }
      handleSelectGroup(groupId)
      setSearchQuery('')
      setDropdownOpen(false)
    },
    [groups, handleSelectGroup]
  )

  const handleExpandAll = useCallback(() => {
    setExpandedCategoryIds(new Set(Array.from(categories.keys())))
    setExpandedGroupIds(new Set(Array.from(groups.keys())))
  }, [categories, groups])

  const handleCollapseAll = useCallback(() => {
    setExpandedCategoryIds(new Set())
    setExpandedGroupIds(new Set())
  }, [])

  const breadcrumb = useMemo(() => {
    const parts: { label: string; onClick?: () => void }[] = []

    if (selectedCategoryId) {
      const cat = categories.get(selectedCategoryId)
      if (cat) {
        parts.push({
          label: cat.name,
          onClick: () => handleSelectCategory(selectedCategoryId),
        })
      }
    }

    if (selectedGroupId) {
      const grp = groups.get(selectedGroupId)
      if (grp) {
        parts.push({
          label: grp.name,
          onClick: () => handleSelectGroup(selectedGroupId),
        })
      }
    }

    if (selectedTypeId) {
      const type = types.get(selectedTypeId)
      if (type) {
        parts.push({ label: type.name })
      }
    }

    return parts
  }, [
    selectedCategoryId,
    selectedGroupId,
    selectedTypeId,
    categories,
    groups,
    types,
    handleSelectCategory,
    handleSelectGroup,
  ])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-border px-4 py-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showUnpublished}
            onChange={(e) => setShowUnpublished(e.target.checked)}
            className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
          <span className="text-sm text-content-secondary">
            Show unpublished
          </span>
        </label>
        <div className="flex-1" />
        <button
          onClick={handleExpandAll}
          className="px-2 py-1 text-xs text-content-secondary hover:text-content"
        >
          Expand All
        </button>
        <button
          onClick={handleCollapseAll}
          className="px-2 py-1 text-xs text-content-secondary hover:text-content"
        >
          Collapse All
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 flex-shrink-0 flex-col overflow-hidden border-r border-border">
          <div className="border-b border-border p-2">
            <div ref={searchContainerRef} className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-content-secondary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setDropdownOpen(true)}
                onBlur={(e) => {
                  if (!searchContainerRef.current?.contains(e.relatedTarget)) {
                    setDropdownOpen(false)
                  }
                }}
                placeholder={
                  allTypesLoaded ? 'Search...' : 'Search (load types first)'
                }
                className="w-full rounded border border-border bg-surface-tertiary py-1.5 pl-8 pr-8 text-sm placeholder:text-content-muted focus:border-accent focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {dropdownOpen && searchResults && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded border border-border bg-surface-secondary shadow-lg">
                  {searchResults.categories.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold uppercase text-content-muted">
                        Categories
                      </div>
                      {searchResults.categories.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => handleSearchCategoryClick(cat.id)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-tertiary ${cat.published === false ? 'opacity-60' : ''}`}
                        >
                          <span
                            className={`text-sm text-content ${cat.published === false ? 'italic' : ''}`}
                          >
                            {cat.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.groups.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold uppercase text-content-muted">
                        Groups
                      </div>
                      {searchResults.groups.map((grp) => (
                        <button
                          key={grp.id}
                          onClick={() => handleSearchGroupClick(grp.id)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-tertiary ${grp.published === false ? 'opacity-60' : ''}`}
                        >
                          <div>
                            <div
                              className={`text-sm text-content ${grp.published === false ? 'italic' : ''}`}
                            >
                              {grp.name}
                            </div>
                            <div className="text-xs text-content-secondary">
                              {grp.categoryName}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.types.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold uppercase text-content-muted">
                        Items
                      </div>
                      {searchResults.types.map((type) => (
                        <button
                          key={type.id}
                          onClick={() => handleSelectType(type.id)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-tertiary ${type.published === false ? 'opacity-60' : ''}`}
                        >
                          <TypeIcon
                            typeId={type.id}
                            categoryId={type.categoryId}
                            size="md"
                          />
                          <div>
                            <div
                              className={`text-sm text-content ${type.published === false ? 'italic' : ''}`}
                            >
                              {type.name}
                            </div>
                            <div className="text-xs text-content-secondary">
                              {type.categoryName} › {type.groupName}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!allTypesLoaded && (
              <button
                onClick={handleLoadAllTypes}
                disabled={loadingTypes}
                className="mt-2 w-full rounded bg-accent/20 py-1 text-xs text-accent hover:bg-accent/30 disabled:opacity-50"
              >
                {loadingTypes ? 'Loading...' : 'Load All Types for Search'}
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1">
            <CategoryGroupTree
              categories={categories}
              groups={groups}
              types={types}
              expandedCategoryIds={expandedCategoryIds}
              expandedGroupIds={expandedGroupIds}
              selectedCategoryId={selectedCategoryId}
              selectedGroupId={selectedGroupId}
              selectedTypeId={selectedTypeId}
              showUnpublished={showUnpublished}
              onToggleCategory={handleToggleCategory}
              onToggleGroup={handleToggleGroup}
              onSelectCategory={handleSelectCategory}
              onSelectGroup={handleSelectGroup}
              onSelectType={handleSelectType}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 border-b border-border px-4 py-2 text-sm">
              {breadcrumb.map((part, i) => (
                <span key={part.label} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 text-content-muted" />
                  )}
                  {part.onClick ? (
                    <button
                      onClick={part.onClick}
                      className="text-accent hover:underline"
                    >
                      {part.label}
                    </button>
                  ) : (
                    <span className="text-content">{part.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedTypeId ? (
              <FeatureErrorBoundary feature="Item Details">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-accent" />
                    </div>
                  }
                >
                  <ItemDetailPanel
                    typeId={selectedTypeId}
                    onNavigate={handleSelectType}
                    showUnpublished={showUnpublished}
                  />
                </Suspense>
              </FeatureErrorBoundary>
            ) : (
              <div className="flex h-full items-center justify-center text-content-secondary">
                <p>Select an item from the tree to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
