import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { TypeIcon } from './type-icon'

interface BlueprintSearchProps {
  mode: 'product' | 'blueprint'
  value: { id: number; name: string } | null
  onChange: (item: { id: number; name: string } | null) => void
  placeholder?: string
  className?: string
}

let blueprintsCache: BlueprintListItem[] | null = null
let loadingPromise: Promise<BlueprintListItem[]> | null = null

async function loadBlueprints(): Promise<BlueprintListItem[]> {
  if (blueprintsCache) return blueprintsCache
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const result = await window.electronAPI!.refBlueprints()
    if (Array.isArray(result)) {
      blueprintsCache = result
      return result
    }
    throw new Error('error' in result ? result.error : 'Failed to load blueprints')
  })()

  return loadingPromise
}

export function BlueprintSearch({ mode, value, onChange, placeholder, className = '' }: BlueprintSearchProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [blueprints, setBlueprints] = useState<BlueprintListItem[]>(blueprintsCache ?? [])
  const [loadStatus, setLoadStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isLoading = isOpen && blueprints.length === 0 && loadStatus === 'idle'

  useEffect(() => {
    if (!isLoading) return

    loadBlueprints()
      .then((data) => {
        setBlueprints(data)
        setLoadStatus('done')
      })
      .catch((err) => {
        setErrorMsg(String(err))
        setLoadStatus('error')
      })
  }, [isLoading])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim() || blueprints.length === 0) return []
    const q = query.toLowerCase()
    const searchField = mode === 'product' ? 'productName' : 'name'
    return blueprints
      .filter((bp) => bp[searchField]?.toLowerCase().includes(q))
      .slice(0, 50)
  }, [query, blueprints, mode])

  function handleQueryChange(newQuery: string) {
    setQuery(newQuery)
    setHighlightIndex(0)
    if (!isOpen) setIsOpen(true)
  }

  function handleSelect(bp: BlueprintListItem) {
    const id = mode === 'product' ? bp.productId : bp.id
    const name = mode === 'product' ? bp.productName : bp.name
    onChange({ id, name })
    setQuery('')
    setIsOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || filtered.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[highlightIndex]
      if (item) handleSelect(item)
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  function handleClear() {
    onChange(null)
    setQuery('')
    inputRef.current?.focus()
  }

  const displayPlaceholder = placeholder || (mode === 'product' ? 'Search products...' : 'Search blueprints...')
  const iconCategoryId = mode === 'blueprint' ? 9 : undefined

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {value ? (
        <div className="flex items-center gap-2 rounded border border-border bg-surface-tertiary px-3 py-2">
          <TypeIcon typeId={value.id} categoryId={iconCategoryId} size="sm" />
          <span className="flex-1 text-sm truncate">{value.name}</span>
          <button
            onClick={handleClear}
            className="text-content-secondary hover:text-content"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-secondary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={displayPlaceholder}
            className="w-full rounded border border-border bg-surface-tertiary pl-9 pr-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-content-secondary" />
          )}
        </div>
      )}

      {isOpen && !value && (
        <div className="absolute z-50 mt-1 w-full rounded border border-border bg-surface-secondary shadow-lg max-h-64 overflow-y-auto">
          {errorMsg && (
            <div className="px-3 py-2 text-sm text-semantic-negative">{errorMsg}</div>
          )}
          {isLoading && !errorMsg && (
            <div className="px-3 py-2 text-sm text-content-secondary">Loading...</div>
          )}
          {!isLoading && !errorMsg && query.trim() && filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-content-secondary">No matches found</div>
          )}
          {!isLoading && !errorMsg && !query.trim() && (
            <div className="px-3 py-2 text-sm text-content-secondary">Type to search...</div>
          )}
          {filtered.map((bp, i) => {
            const id = mode === 'product' ? bp.productId : bp.id
            const name = mode === 'product' ? bp.productName : bp.name
            return (
              <button
                key={bp.id}
                onClick={() => handleSelect(bp)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-tertiary ${
                  i === highlightIndex ? 'bg-surface-tertiary' : ''
                }`}
              >
                <TypeIcon typeId={id} categoryId={iconCategoryId} size="sm" />
                <span className="truncate">{name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
