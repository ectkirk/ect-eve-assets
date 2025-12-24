import { useState, useCallback } from 'react'
import { ContractsFilters } from './ContractsFilters'
import {
  ContractsResultsTable,
  SORT_PRESETS,
  type SortPreset,
} from './ContractsResultsTable'
import { getMockContracts } from './mock-data'
import { DEFAULT_FILTERS } from './types'
import type { ContractSearchFilters, SearchContract } from './types'

export function ContractsSearchPanel() {
  const [filters, setFilters] = useState<ContractSearchFilters>(DEFAULT_FILTERS)
  const [results, setResults] = useState<SearchContract[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [sortPreset, setSortPreset] = useState<SortPreset>('price-desc')

  const handleSearch = useCallback(async () => {
    setIsLoading(true)
    setHasSearched(true)
    try {
      // TODO: Replace with actual API call when backend is ready
      // const response = await window.electronAPI!.searchContracts(filters)
      const response = getMockContracts(filters)
      setResults(response.contracts)
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  return (
    <div className="flex h-full">
      <ContractsFilters
        filters={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        isLoading={isLoading}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-medium text-content">
            {hasSearched
              ? `${results.length} contract${results.length !== 1 ? 's' : ''} found`
              : 'Contract Search'}
          </h2>
          {hasSearched && results.length > 0 && (
            <select
              value={sortPreset}
              onChange={(e) => setSortPreset(e.target.value as SortPreset)}
              className="rounded border border-border bg-surface-tertiary px-2 py-1 text-sm focus:border-accent focus:outline-hidden"
            >
              {SORT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {hasSearched ? (
          <ContractsResultsTable
            contracts={results}
            mode={filters.mode}
            sortPreset={sortPreset}
            onSortPresetChange={setSortPreset}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-content-muted">
            <p>Enter search criteria and click Search</p>
          </div>
        )}
      </div>
    </div>
  )
}
