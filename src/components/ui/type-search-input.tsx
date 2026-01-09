import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
  useId,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { TypeIcon } from '@/components/ui/type-icon'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'

interface TypeSearchInputProps {
  value: CachedType | null
  onChange: (type: CachedType | null) => void
  filterFn?: (type: CachedType) => boolean
}

const SEARCH_DEBOUNCE_MS = 200
const MAX_RESULTS = 50

const SearchResult = memo(function SearchResult({
  type,
  onSelect,
  isHighlighted,
  id,
}: {
  type: CachedType
  onSelect: (type: CachedType) => void
  isHighlighted: boolean
  id: string
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isHighlighted}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${
        isHighlighted ? 'bg-surface-tertiary' : 'hover:bg-surface-tertiary'
      }`}
      onClick={() => onSelect(type)}
    >
      <TypeIcon typeId={type.id} categoryId={type.categoryId} size="sm" />
      <span className="text-sm truncate">{type.name}</span>
    </div>
  )
})

export function TypeSearchInput({
  value,
  onChange,
  filterFn,
}: TypeSearchInputProps) {
  const { t } = useTranslation('common')
  const [inputValue, setInputValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const types = useReferenceCacheStore((s) => s.types)

  const searchableTypes = useMemo(() => {
    const result: CachedType[] = []
    for (const type of types.values()) {
      if (!type.published) continue
      if (filterFn && !filterFn(type)) continue
      result.push(type)
    }
    return result
  }, [types, filterFn])

  const searchResults = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) return []

    const query = debouncedQuery.toLowerCase()
    const matches: CachedType[] = []

    for (const type of searchableTypes) {
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
  }, [debouncedQuery, searchableTypes])

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

  const valueName = value?.name ?? ''
  useEffect(() => {
    setInputValue(valueName)
  }, [valueName])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchResults])

  const handleChange = useCallback(
    (newValue: string) => {
      setInputValue(newValue)
      setIsOpen(true)
      if (value) onChange(null)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        setDebouncedQuery(newValue)
      }, SEARCH_DEBOUNCE_MS)
    },
    [value, onChange]
  )

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setInputValue('')
    setDebouncedQuery('')
    setIsOpen(false)
    onChange(null)
    inputRef.current?.focus()
  }, [onChange])

  const handleSelect = useCallback(
    (type: CachedType) => {
      onChange(type)
      setInputValue(type.name)
      setDebouncedQuery('')
      setIsOpen(false)
    },
    [onChange]
  )

  const handleFocus = useCallback(() => {
    if (inputValue.length >= 2 && !value) setIsOpen(true)
  }, [inputValue, value])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || searchResults.length === 0) {
        if (e.key === 'Escape' && inputValue) {
          e.preventDefault()
          handleClear()
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : searchResults.length - 1
          )
          break
        case 'Enter': {
          e.preventDefault()
          const selected = searchResults[highlightedIndex]
          if (selected) handleSelect(selected)
          break
        }
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          setHighlightedIndex(-1)
          break
      }
    },
    [
      isOpen,
      searchResults,
      highlightedIndex,
      inputValue,
      handleClear,
      handleSelect,
    ]
  )

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-content-muted" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen && searchResults.length > 0}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0
              ? `${listboxId}-option-${highlightedIndex}`
              : undefined
          }
          placeholder={t('search.placeholder')}
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className="w-full rounded border border-border bg-surface-tertiary pl-8 pr-7 py-1.5 text-sm placeholder-content-muted focus:border-accent focus:outline-hidden"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isOpen && searchResults.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded border border-border bg-surface-secondary shadow-lg"
        >
          {searchResults.map((type, index) => (
            <SearchResult
              key={type.id}
              type={type}
              onSelect={handleSelect}
              isHighlighted={index === highlightedIndex}
              id={`${listboxId}-option-${index}`}
            />
          ))}
        </div>
      )}

      {isOpen && debouncedQuery.length >= 2 && searchResults.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded border border-border bg-surface-secondary px-3 py-2 text-sm text-content-secondary shadow-lg">
          No items found
        </div>
      )}
    </div>
  )
}
