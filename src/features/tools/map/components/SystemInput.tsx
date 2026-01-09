import { useState, useCallback } from 'react'
import { useDebounce } from '../hooks/useDebounce'
import { SecurityBadge, type SystemSearchItem } from './MapRouteControls'

const DEBOUNCE_MS = 200
const MAX_RESULTS = 8

interface IndexedSystemItem extends SystemSearchItem {
  nameLower: string
}

interface SystemInputProps {
  placeholder: string
  selectedName: string | null
  selectedSecurity: number | null
  dotColor: string
  indexedSystems: IndexedSystemItem[]
  onSelect: (systemId: number) => void
}

export function SystemInput({
  placeholder,
  selectedName,
  selectedSecurity,
  dotColor,
  indexedSystems,
  onSelect,
}: SystemInputProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SystemSearchItem[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const performSearch = useDebounce((searchQuery: string) => {
    const lower = searchQuery.toLowerCase()
    const matches: SystemSearchItem[] = []
    for (const sys of indexedSystems) {
      if (sys.nameLower.includes(lower)) {
        matches.push(sys)
        if (matches.length >= MAX_RESULTS) break
      }
    }
    setResults(matches)
    setShowDropdown(matches.length > 0)
  }, DEBOUNCE_MS)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value
      setQuery(newQuery)

      if (!newQuery.trim()) {
        setResults([])
        setShowDropdown(false)
        return
      }

      performSearch(newQuery)
    },
    [performSearch]
  )

  const handleSelect = useCallback(
    (sys: SystemSearchItem) => {
      onSelect(sys.id)
      setQuery('')
      setResults([])
      setShowDropdown(false)
      setIsEditing(false)
    },
    [onSelect]
  )

  const handleFocus = useCallback(() => {
    setIsEditing(true)
    if (results.length > 0) setShowDropdown(true)
  }, [results.length])

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setShowDropdown(false)
      setIsEditing(false)
      setQuery('')
    }, 150)
  }, [])

  return (
    <div className="relative flex items-center gap-2">
      <span
        className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {isEditing || !selectedName ? (
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="w-full rounded border border-border-secondary bg-surface-tertiary px-2 py-1 text-xs text-content placeholder-content-muted focus:border-accent focus:outline-none"
          />
          {showDropdown && (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded border border-border-secondary bg-surface-secondary shadow-lg">
              {results.map((sys) => (
                <button
                  key={sys.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelect(sys)
                  }}
                  className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-surface-tertiary"
                >
                  <span className="text-content-secondary">{sys.name}</span>
                  <SecurityBadge security={sys.security} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="flex-1 text-left text-sm text-content-secondary hover:text-content-primary"
        >
          {selectedName}
          {selectedSecurity !== null && (
            <SecurityBadge security={selectedSecurity} />
          )}
        </button>
      )}
    </div>
  )
}
