import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { Search, X } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'

interface MarketItemSearchProps {
  onSelectType: (type: CachedType) => void
}

const SEARCH_DEBOUNCE_MS = 200
const MAX_RESULTS = 50

const SearchResult = memo(function SearchResult({
  type,
  onSelect,
}: {
  type: CachedType
  onSelect: (type: CachedType) => void
}) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-tertiary"
      onClick={() => onSelect(type)}
    >
      <TypeIcon typeId={type.id} categoryId={type.categoryId} size="sm" />
      <span className="text-sm truncate">{type.name}</span>
    </button>
  )
})

export function MarketItemSearch({ onSelectType }: MarketItemSearchProps) {
  const [inputValue, setInputValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const types = useReferenceCacheStore((s) => s.types)

  const marketableTypes = useMemo(() => {
    const result: CachedType[] = []
    for (const type of types.values()) {
      if (type.marketGroupId) result.push(type)
    }
    return result
  }, [types])

  const searchResults = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return []

    const query = debouncedQuery.toLowerCase()
    const matches: CachedType[] = []

    for (const type of marketableTypes) {
      if (type.name.toLowerCase().includes(query)) {
        matches.push(type)
        if (matches.length >= MAX_RESULTS) break
      }
    }

    matches.sort((a, b) => {
      const aStartsWith = a.name.toLowerCase().startsWith(query)
      const bStartsWith = b.name.toLowerCase().startsWith(query)
      if (aStartsWith && !bStartsWith) return -1
      if (!aStartsWith && bStartsWith) return 1
      return a.name.localeCompare(b.name)
    })

    return matches
  }, [debouncedQuery, marketableTypes])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleChange = useCallback((value: string) => {
    setInputValue(value)
    setIsOpen(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value)
    }, SEARCH_DEBOUNCE_MS)
  }, [])

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setInputValue('')
    setDebouncedQuery('')
    setIsOpen(false)
    inputRef.current?.focus()
  }, [])

  const handleSelect = useCallback(
    (type: CachedType) => {
      onSelectType(type)
      setInputValue('')
      setDebouncedQuery('')
      setIsOpen(false)
    },
    [onSelectType]
  )

  const handleFocus = useCallback(() => {
    if (inputValue.length >= 2) setIsOpen(true)
  }, [inputValue])

  return (
    <div ref={containerRef} className="relative px-2 py-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-muted" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search items..."
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          className="w-full rounded border border-border bg-surface-tertiary pl-8 pr-7 py-1.5 text-sm placeholder-content-muted focus:border-accent focus:outline-hidden"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isOpen && searchResults.length > 0 && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 max-h-64 overflow-auto rounded border border-border bg-surface-secondary shadow-lg">
          {searchResults.map((type) => (
            <SearchResult key={type.id} type={type} onSelect={handleSelect} />
          ))}
        </div>
      )}

      {isOpen && debouncedQuery.length >= 2 && searchResults.length === 0 && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded border border-border bg-surface-secondary px-3 py-2 text-sm text-content-secondary shadow-lg">
          No items found
        </div>
      )}
    </div>
  )
}
