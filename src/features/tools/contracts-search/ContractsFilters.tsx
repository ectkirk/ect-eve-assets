import { useState, useMemo } from 'react'
import { Search, MapPin } from 'lucide-react'
import { getAllCategories, getGroupsByCategory } from '@/store/cache'
import { LocationPickerModal } from './LocationPickerModal'
import type {
  ContractSearchFilters,
  ContractType,
  LocationSelection,
} from './types'

const THE_FORGE_ID = 10000002

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
  const [showLocationPicker, setShowLocationPicker] = useState(false)

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

  const handleLocationChange = (selection: LocationSelection) => {
    if (selection === 'all') {
      onChange({
        ...filters,
        locationSelection: 'all',
        regionId: null,
        systemId: null,
        locationName: null,
      })
    } else if (selection === 'the_forge') {
      onChange({
        ...filters,
        locationSelection: 'the_forge',
        regionId: THE_FORGE_ID,
        systemId: null,
        locationName: 'The Forge',
      })
    }
  }

  const handleLocationSelect = (location: {
    type: 'region' | 'system'
    id: number
    name: string
  }) => {
    onChange({
      ...filters,
      locationSelection: 'custom',
      regionId: location.type === 'region' ? location.id : null,
      systemId: location.type === 'system' ? location.id : null,
      locationName: location.name,
    })
    setShowLocationPicker(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      onSearch()
    }
  }

  const getLocationDisplayValue = () => {
    if (filters.locationSelection === 'all') return 'all'
    if (filters.locationSelection === 'the_forge') return 'the_forge'
    return 'custom'
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

        <div>
          <label className={labelClass}>Location</label>
          <div className="flex gap-2">
            <select
              className={selectClass}
              value={getLocationDisplayValue()}
              onChange={(e) =>
                handleLocationChange(e.target.value as LocationSelection)
              }
            >
              <option value="all">All Regions</option>
              <option value="the_forge">The Forge</option>
              {filters.locationSelection === 'custom' &&
                filters.locationName && (
                  <option value="custom">{filters.locationName}</option>
                )}
            </select>
            <button
              onClick={() => setShowLocationPicker(true)}
              className="rounded border border-border bg-surface-tertiary px-2 text-content-secondary hover:bg-surface-secondary hover:text-content"
              title="Pick a location"
            >
              <MapPin className="h-4 w-4" />
            </button>
          </div>
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
              <option value="exclude_want_to_buy">Exclude Want To Buy</option>
            </select>
          </div>
        )}

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
            <span className="text-sm text-content">Exclude multiple items</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={filters.exactMatch}
              onChange={(e) => updateFilter('exactMatch', e.target.checked)}
            />
            <span className="text-sm text-content">Exact type match</span>
          </label>
        </div>

        <div>
          <label className={labelClass}>
            Price ({filters.mode === 'courier' ? 'Reward' : 'millions'})
          </label>
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

        <div>
          <label className={labelClass}>Security Status</label>
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.securityHigh}
                onChange={(e) => updateFilter('securityHigh', e.target.checked)}
              />
              <span className="text-sm text-status-positive">High</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.securityLow}
                onChange={(e) => updateFilter('securityLow', e.target.checked)}
              />
              <span className="text-sm text-status-warning">Low</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.securityNull}
                onChange={(e) => updateFilter('securityNull', e.target.checked)}
              />
              <span className="text-sm text-status-negative">Null</span>
            </label>
          </div>
        </div>

        <div>
          <label className={labelClass}>Issuer</label>
          <input
            type="text"
            placeholder="Character name..."
            className={inputClass}
            value={filters.issuer}
            onChange={(e) => updateFilter('issuer', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
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

      {showLocationPicker && (
        <LocationPickerModal
          onSelect={handleLocationSelect}
          onClose={() => setShowLocationPicker(false)}
        />
      )}
    </div>
  )
}
