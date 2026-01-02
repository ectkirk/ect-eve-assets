import { useState, useCallback } from 'react'
import type { CachedSystem, CachedRegion } from '@/store/reference-cache'
import type { SearchResult } from '../types'
import { useDebounce } from './useDebounce'

interface UseMapSearchOptions {
  systems: CachedSystem[]
  regions: CachedRegion[]
}

interface UseMapSearchReturn {
  query: string
  results: SearchResult[]
  showAutocomplete: boolean
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleFocus: () => void
  handleBlur: () => void
  selectResult: (result: SearchResult) => void
}

const DEBOUNCE_MS = 300
const MAX_RESULTS = 10

export function useMapSearch({
  systems,
  regions,
}: UseMapSearchOptions): UseMapSearchReturn {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)

  const performSearch = useDebounce((searchQuery: string) => {
    const lowerQuery = searchQuery.toLowerCase()
    const matches: SearchResult[] = []

    for (const system of systems) {
      if (system.name.toLowerCase().includes(lowerQuery)) {
        matches.push({ type: 'system', name: system.name, id: system.id })
        if (matches.length >= MAX_RESULTS) break
      }
    }

    if (matches.length < MAX_RESULTS) {
      for (const region of regions) {
        if (region.name.toLowerCase().includes(lowerQuery)) {
          matches.push({ type: 'region', name: region.name, id: region.id })
          if (matches.length >= MAX_RESULTS) break
        }
      }
    }

    setResults(matches)
    setShowAutocomplete(matches.length > 0)
  }, DEBOUNCE_MS)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQuery = e.target.value
      setQuery(newQuery)

      if (!newQuery.trim()) {
        setResults([])
        setShowAutocomplete(false)
        return
      }

      performSearch(newQuery)
    },
    [performSearch]
  )

  const handleFocus = useCallback(() => {
    if (results.length > 0) {
      setShowAutocomplete(true)
    }
  }, [results.length])

  const handleBlur = useCallback(() => {
    setShowAutocomplete(false)
  }, [])

  const selectResult = useCallback((_result: SearchResult) => {
    setQuery('')
    setShowAutocomplete(false)
    setResults([])
  }, [])

  return {
    query,
    results,
    showAutocomplete,
    handleChange,
    handleFocus,
    handleBlur,
    selectResult,
  }
}
