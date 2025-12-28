import { useMemo, useCallback } from 'react'
import { Search } from 'lucide-react'
import { getAllCategories, getGroupsByCategory } from '@/store/cache'
import { TypeSearchInput } from '@/components/ui/type-search-input'
import {
  useReferenceCacheStore,
  type CachedType,
} from '@/store/reference-cache'
import { BUYBACK_REGIONS } from '@/hooks/useBuybackSelection'
import type { ContractSearchFilters, ContractType } from './types'

interface ContractsFiltersProps {
  filters: ContractSearchFilters
  onChange: (filters: ContractSearchFilters) => void
  onSearch: () => void
  isLoading: boolean
}

const inputClass =
  'w-full rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden'

const selectClass =
  'w-full rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden'

const checkboxClass =
  'h-4 w-4 rounded border-border text-accent focus:ring-accent'

const labelClass = 'block text-xs font-medium text-content-secondary mb-1'

export function ContractsFilters({
  filters,
  onChange,
  onSearch,
  isLoading,
}: ContractsFiltersProps) {
  const categories = useMemo(
    () => getAllCategories(true).sort((a, b) => a.name.localeCompare(b.name)),
    []
  )

  const groups = useMemo(() => {
    if (!filters.categoryId) return []
    return getGroupsByCategory(filters.categoryId, true).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [filters.categoryId])

  const regions = useReferenceCacheStore((s) => s.regions)
  const sortedRegions = useMemo(() => {
    const list = Array.from(regions.values()).filter((r) =>
      BUYBACK_REGIONS.has(r.id)
    )
    list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [regions])

  const types = useReferenceCacheStore((s) => s.types)
  const selectedType = useMemo(() => {
    if (!filters.typeId) return null
    return types.get(filters.typeId) ?? null
  }, [filters.typeId, types])

  const handleTypeChange = useCallback(
    (type: CachedType | null) => {
      onChange({
        ...filters,
        typeId: type?.id ?? null,
        typeName: type?.name ?? null,
        searchText: '',
      })
    },
    [filters, onChange]
  )

  const updateFilter = <K extends keyof ContractSearchFilters>(
    key: K,
    value: ContractSearchFilters[K]
  ) => {
    const updated = { ...filters, [key]: value }
    if (key === 'categoryId') {
      updated.groupId = null
    }
    onChange(updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      onSearch()
    }
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-surface-secondary/50">
      <div className="flex border-b border-border">
        <button
          onClick={() => updateFilter('mode', 'buySell')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            filters.mode === 'buySell'
              ? 'border-b-2 border-accent text-accent'
              : 'text-content-secondary hover:text-content'
          }`}
        >
          Buy & Sell
        </button>
        <button
          onClick={() => updateFilter('mode', 'courier')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            filters.mode === 'courier'
              ? 'border-b-2 border-accent text-accent'
              : 'text-content-secondary hover:text-content'
          }`}
        >
          Courier
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {filters.mode === 'buySell' && !filters.exactTypeMatch && (
          <div>
            <label className={labelClass}>Search by</label>
            <input
              type="text"
              placeholder="Item name, type..."
              className={inputClass}
              value={filters.searchText}
              onChange={(e) => updateFilter('searchText', e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>
            {filters.mode === 'courier' ? 'Origin Region' : 'Region'}
          </label>
          <select
            className={selectClass}
            value={filters.regionId ?? ''}
            onChange={(e) =>
              updateFilter(
                'regionId',
                e.target.value ? Number(e.target.value) : null
              )
            }
          >
            <option value="">All Regions</option>
            {sortedRegions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </div>

        {filters.mode === 'buySell' && (
          <div>
            <label className={labelClass}>Contract Type</label>
            <select
              className={selectClass}
              value={filters.contractType}
              onChange={(e) =>
                updateFilter('contractType', e.target.value as ContractType)
              }
            >
              <option value="want_to_sell">Want To Sell</option>
              <option value="want_to_buy">Want To Buy</option>
              <option value="auction">Auctions</option>
            </select>
          </div>
        )}

        {filters.mode === 'buySell' && !filters.exactTypeMatch && (
          <>
            <div>
              <label className={labelClass}>Item Category</label>
              <select
                className={selectClass}
                value={filters.categoryId ?? ''}
                onChange={(e) =>
                  updateFilter(
                    'categoryId',
                    e.target.value ? Number(e.target.value) : null
                  )
                }
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {filters.categoryId && (
              <div>
                <label className={labelClass}>Item Group</label>
                <select
                  className={selectClass}
                  value={filters.groupId ?? ''}
                  onChange={(e) =>
                    updateFilter(
                      'groupId',
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                >
                  <option value="">All Groups</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {filters.mode === 'buySell' && (
          <div className="space-y-2 pt-1">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.excludeMultiple}
                onChange={(e) =>
                  updateFilter('excludeMultiple', e.target.checked)
                }
              />
              <span className="text-sm text-content">
                Exclude multiple items
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.exactTypeMatch}
                onChange={(e) => {
                  const checked = e.target.checked
                  onChange({
                    ...filters,
                    exactTypeMatch: checked,
                    typeId: checked ? filters.typeId : null,
                    typeName: checked ? filters.typeName : null,
                    searchText: checked ? '' : filters.searchText,
                    categoryId: checked ? null : filters.categoryId,
                    groupId: checked ? null : filters.groupId,
                  })
                }}
              />
              <span className="text-sm text-content">Exact type match</span>
            </label>
          </div>
        )}

        {filters.mode === 'buySell' && filters.exactTypeMatch && (
          <div>
            <label className={labelClass}>Item Type</label>
            <TypeSearchInput
              value={selectedType}
              onChange={handleTypeChange}
              placeholder="Search for exact type..."
            />
          </div>
        )}

        {filters.mode === 'buySell' && (
          <div>
            <label className={labelClass}>Price (millions)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Min"
                className={inputClass}
                value={filters.priceMin}
                onChange={(e) => updateFilter('priceMin', e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <span className="text-content-muted">-</span>
              <input
                type="text"
                placeholder="Max"
                className={inputClass}
                value={filters.priceMax}
                onChange={(e) => updateFilter('priceMax', e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>
        )}

        {filters.mode === 'buySell' && (
          <div>
            <label className={labelClass}>Security Status</label>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={filters.securityHigh}
                  onChange={(e) =>
                    updateFilter('securityHigh', e.target.checked)
                  }
                />
                <span className="text-sm text-status-positive">High</span>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={filters.securityLow}
                  onChange={(e) =>
                    updateFilter('securityLow', e.target.checked)
                  }
                />
                <span className="text-sm text-status-warning">Low</span>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={filters.securityNull}
                  onChange={(e) =>
                    updateFilter('securityNull', e.target.checked)
                  }
                />
                <span className="text-sm text-status-negative">Null</span>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <button
          onClick={onSearch}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>
    </div>
  )
}
