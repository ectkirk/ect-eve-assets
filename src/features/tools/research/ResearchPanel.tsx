import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, Loader2 } from 'lucide-react'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { TypeIcon } from '@/components/ui/type-icon'
import { loadReferenceData } from '@/api/ref-data-loader'
import { useDebouncedValue, useSetToggle } from '@/hooks'
import { BlueprintTree } from './BlueprintTree'
import { ResearchCalculator } from './ResearchCalculator'

const SEARCH_DEBOUNCE_MS = 150
const SEARCH_LIMIT = 30
const BLUEPRINT_CATEGORY_ID = 9

interface SelectedType {
  typeId: number
  typeName: string
}

export function ResearchPanel() {
  const { t } = useTranslation(['tools', 'common'])
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedType, setSelectedType] = useState<SelectedType | null>(null)
  const debouncedQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(
    new Set()
  )
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(
    new Set()
  )

  const groups = useReferenceCacheStore((s) => s.groups)
  const types = useReferenceCacheStore((s) => s.types)
  const allTypesLoaded = useReferenceCacheStore((s) => s.allTypesLoaded)

  useEffect(() => {
    if (!allTypesLoaded) {
      loadReferenceData()
    }
  }, [allTypesLoaded])

  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) return null
    if (!allTypesLoaded) return null

    const query = debouncedQuery.toLowerCase()
    const matched: Array<{
      id: number
      name: string
      groupName: string
    }> = []

    for (const type of types.values()) {
      if (type.published === false) continue
      if (type.categoryId !== BLUEPRINT_CATEGORY_ID) continue

      if (type.name.toLowerCase().includes(query)) {
        matched.push({
          id: type.id,
          name: type.name,
          groupName: type.groupName,
        })
        if (matched.length >= SEARCH_LIMIT) break
      }
    }

    return matched
  }, [debouncedQuery, types, allTypesLoaded])

  const handleToggleCategory = useSetToggle(setExpandedCategoryIds)
  const handleToggleGroup = useSetToggle(setExpandedGroupIds)

  const handleSelectType = useCallback(
    (typeId: number) => {
      const type = types.get(typeId)
      if (!type) return

      setSelectedType({
        typeId,
        typeName: type.name,
      })

      setExpandedCategoryIds(
        (prev) => new Set([...prev, BLUEPRINT_CATEGORY_ID])
      )
      setExpandedGroupIds((prev) => new Set([...prev, type.groupId]))
      setSearchQuery('')
      setDropdownOpen(false)
    },
    [types]
  )

  const handleExpandAll = useCallback(() => {
    const groupIds = new Set<number>()

    for (const type of types.values()) {
      if (type.published === false) continue
      if (type.categoryId !== BLUEPRINT_CATEGORY_ID) continue
      groupIds.add(type.groupId)
    }

    setExpandedCategoryIds(new Set([BLUEPRINT_CATEGORY_ID]))
    setExpandedGroupIds(groupIds)
  }, [types])

  const handleCollapseAll = useCallback(() => {
    setExpandedCategoryIds(new Set())
    setExpandedGroupIds(new Set())
  }, [])

  const isLoading = !allTypesLoaded

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-border px-4 py-2">
        <div className="flex-1" />
        <button
          onClick={handleExpandAll}
          disabled={isLoading}
          className="px-2 py-1 text-xs text-content-secondary hover:text-content disabled:opacity-50"
        >
          {t('reference.expandAll')}
        </button>
        <button
          onClick={handleCollapseAll}
          disabled={isLoading}
          className="px-2 py-1 text-xs text-content-secondary hover:text-content disabled:opacity-50"
        >
          {t('reference.collapseAll')}
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
                  isLoading
                    ? t('research.loadingTypes')
                    : t('common:search.placeholder')
                }
                disabled={isLoading}
                className="w-full rounded border border-border bg-surface-tertiary py-1.5 pl-8 pr-8 text-sm placeholder:text-content-muted focus:border-accent focus:outline-hidden disabled:opacity-50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {dropdownOpen && searchResults && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded border border-border bg-surface-secondary shadow-lg">
                  {searchResults.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleSelectType(type.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-tertiary"
                    >
                      <TypeIcon
                        typeId={type.id}
                        categoryId={BLUEPRINT_CATEGORY_ID}
                        size="md"
                      />
                      <div>
                        <div className="text-sm text-content">{type.name}</div>
                        <div className="text-xs text-content-secondary">
                          {type.groupName}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : (
              <BlueprintTree
                groups={groups}
                types={types}
                expandedCategoryIds={expandedCategoryIds}
                expandedGroupIds={expandedGroupIds}
                selectedTypeId={selectedType?.typeId ?? null}
                onToggleCategory={handleToggleCategory}
                onToggleGroup={handleToggleGroup}
                onSelectType={handleSelectType}
              />
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selectedType ? (
            <ResearchCalculator
              key={selectedType.typeId}
              typeId={selectedType.typeId}
              typeName={selectedType.typeName}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-content-secondary">
              <p>{t('research.selectBlueprintPrompt')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
