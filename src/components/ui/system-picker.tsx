import { useMemo, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { cn } from '@/lib/utils'

const MAX_RESULTS = 8

interface SystemOption {
  id: number
  name: string
  nameLower: string
  regionName: string
}

interface SystemPickerProps {
  systemId: number | null
  onChange: (systemId: number | null) => void
  placeholder: string
  clearLabel: string
  className?: string
}

export function findSystems(
  options: readonly SystemOption[],
  query: string,
  limit = MAX_RESULTS,
): SystemOption[] {
  const lower = query.trim().toLowerCase()
  if (!lower) return []
  const prefix: SystemOption[] = []
  const contains: SystemOption[] = []
  for (const option of options) {
    if (option.nameLower.startsWith(lower)) {
      prefix.push(option)
      if (prefix.length >= limit) break
    } else if (contains.length < limit && option.nameLower.includes(lower)) {
      contains.push(option)
    }
  }
  return [...prefix, ...contains].slice(0, limit)
}

export function SystemPicker({
  systemId,
  onChange,
  placeholder,
  clearLabel,
  className,
}: SystemPickerProps) {
  const systems = useReferenceCacheStore((s) => s.systems)
  const regions = useReferenceCacheStore((s) => s.regions)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const options = useMemo<SystemOption[]>(
    () =>
      Array.from(systems.values())
        .map((system) => ({
          id: system.id,
          name: system.name,
          nameLower: system.name.toLowerCase(),
          regionName: regions.get(system.regionId)?.name ?? '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [systems, regions],
  )

  const results = useMemo(() => findSystems(options, query), [options, query])
  const selected = systemId !== null ? systems.get(systemId) : undefined

  const select = (option: SystemOption) => {
    onChange(option.id)
    setQuery('')
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIsOpen(true)
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const option = results.at(activeIndex)
      if (option) {
        e.preventDefault()
        select(option)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  if (selected) {
    const regionName = regions.get(selected.regionId)?.name
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 rounded border border-accent/60 bg-surface-tertiary px-2 py-1.5 text-sm',
          className,
        )}
      >
        <MapPin className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate" title={regionName}>
          {selected.name}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null)
          }}
          aria-label={clearLabel}
          title={clearLabel}
          className="ml-auto rounded p-0.5 text-content-secondary hover:bg-surface-secondary hover:text-content"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const listId = 'system-picker-results'
  const showResults = isOpen && results.length > 0

  return (
    <div className={cn('relative', className)}>
      <MapPin
        className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-content-muted"
        aria-hidden="true"
      />
      <input
        type="text"
        role="combobox"
        aria-expanded={showResults}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={placeholder}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIndex(0)
          setIsOpen(true)
        }}
        onFocus={() => {
          setIsOpen(true)
        }}
        onBlur={() => {
          setIsOpen(false)
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded border border-border bg-surface-tertiary py-1.5 pr-2 pl-8 text-sm placeholder-content-muted focus:border-accent focus:outline-hidden"
      />
      {showResults && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full left-0 z-30 mt-1 w-full overflow-hidden rounded border border-border bg-surface-secondary py-1 shadow-lg"
        >
          {results.map((option, index) => (
            <li
              key={option.id}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                select(option)
              }}
              onMouseEnter={() => {
                setActiveIndex(index)
              }}
              className={cn(
                'flex cursor-pointer items-baseline justify-between gap-2 px-2 py-1 text-sm',
                index === activeIndex && 'bg-surface-tertiary',
              )}
            >
              <span className="truncate">{option.name}</span>
              <span className="shrink-0 text-xs text-content-muted">
                {option.regionName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
