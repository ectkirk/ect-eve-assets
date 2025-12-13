import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, Loader2, X } from 'lucide-react'

interface SystemSearchProps {
  value: { id: number; name: string } | null
  onChange: (item: { id: number; name: string } | null) => void
  placeholder?: string
  className?: string
}

let systemsCache: SystemListItem[] | null = null
let loadingPromise: Promise<SystemListItem[]> | null = null

async function loadSystems(): Promise<SystemListItem[]> {
  if (systemsCache) return systemsCache
  if (loadingPromise) return loadingPromise

  loadingPromise = (async () => {
    const result = await window.electronAPI!.refSystems()
    if (Array.isArray(result)) {
      systemsCache = result
      return result
    }
    throw new Error('error' in result ? result.error : 'Failed to load systems')
  })()

  return loadingPromise
}

function getSecurityClass(security: number): string {
  if (security >= 0.5) return 'text-green-400'
  if (security > 0) return 'text-yellow-400'
  return 'text-red-400'
}

export function SystemSearch({ value, onChange, placeholder, className = '' }: SystemSearchProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [systems, setSystems] = useState<SystemListItem[]>(systemsCache ?? [])
  const [loadStatus, setLoadStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isLoading = isOpen && systems.length === 0 && loadStatus === 'idle'

  useEffect(() => {
    if (!isLoading) return

    loadSystems()
      .then((data) => {
        setSystems(data)
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
    if (!query.trim() || systems.length === 0) return []
    const q = query.toLowerCase()
    return systems
      .filter((sys) => sys.name?.toLowerCase().includes(q))
      .slice(0, 50)
  }, [query, systems])

  function handleQueryChange(newQuery: string) {
    setQuery(newQuery)
    setHighlightIndex(0)
    if (!isOpen) setIsOpen(true)
  }

  function handleSelect(sys: SystemListItem) {
    onChange({ id: sys.id, name: sys.name })
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

  const displayPlaceholder = placeholder || 'Search systems...'

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {value ? (
        <div className="flex items-center gap-2 rounded border border-slate-600 bg-slate-700 px-3 py-2">
          <span className="flex-1 text-sm truncate">{value.name}</span>
          <button
            onClick={handleClear}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={displayPlaceholder}
            className="w-full rounded border border-slate-600 bg-slate-700 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
          )}
        </div>
      )}

      {isOpen && !value && (
        <div className="absolute z-50 mt-1 w-full rounded border border-slate-600 bg-slate-800 shadow-lg max-h-64 overflow-y-auto">
          {errorMsg && (
            <div className="px-3 py-2 text-sm text-red-400">{errorMsg}</div>
          )}
          {isLoading && !errorMsg && (
            <div className="px-3 py-2 text-sm text-slate-400">Loading...</div>
          )}
          {!isLoading && !errorMsg && query.trim() && filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">No matches found</div>
          )}
          {!isLoading && !errorMsg && !query.trim() && (
            <div className="px-3 py-2 text-sm text-slate-400">Type to search...</div>
          )}
          {filtered.map((sys, i) => (
            <button
              key={sys.id}
              onClick={() => handleSelect(sys)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-700 ${
                i === highlightIndex ? 'bg-slate-700' : ''
              }`}
            >
              <span className="truncate">{sys.name}</span>
              <span className={`text-xs tabular-nums ${getSecurityClass(sys.security)}`}>
                {sys.security.toFixed(1)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
