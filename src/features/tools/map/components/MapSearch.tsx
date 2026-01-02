import { memo, useCallback } from 'react'
import type { SearchResult } from '../types'

interface MapSearchProps {
  query: string
  results: SearchResult[]
  showAutocomplete: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onFocus: () => void
  onBlur: () => void
  onSelectResult: (result: SearchResult) => void
}

export const MapSearch = memo(function MapSearch({
  query,
  results,
  showAutocomplete,
  onChange,
  onFocus,
  onBlur,
  onSelectResult,
}: MapSearchProps) {
  const handleResultMouseDown = useCallback(
    (e: React.MouseEvent, result: SearchResult) => {
      e.preventDefault()
      onSelectResult(result)
    },
    [onSelectResult]
  )

  return (
    <div className="absolute left-4 top-4 w-80">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Search systems or regions..."
          className="w-full rounded-lg border border-border-secondary bg-surface-secondary px-4 py-2 text-sm text-content placeholder-content-muted focus:border-accent focus:outline-none"
        />

        {showAutocomplete && results.length > 0 && (
          <div className="absolute top-full z-10 mt-1 max-h-96 w-full overflow-y-auto rounded-lg border border-border-secondary bg-surface-secondary shadow-lg">
            {results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                onMouseDown={(e) => handleResultMouseDown(e, result)}
                className="flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-surface-tertiary"
              >
                <span className="text-sm text-content">{result.name}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    result.type === 'system'
                      ? 'bg-accent/20 text-accent'
                      : 'bg-purple-900/50 text-purple-300'
                  }`}
                >
                  {result.type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
