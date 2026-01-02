import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import {
  ChevronDown,
  Check,
  ChevronsUpDown,
  ChevronsDownUp,
  Search,
  X,
} from 'lucide-react'
import { useTabControls } from '@/context'
import { formatNumber } from '@/lib/utils'
import {
  useAssetSettings,
  ASSET_SETTINGS_CONFIG,
} from '@/store/asset-settings-store'
import { useClickOutside } from '@/hooks'

const ASSET_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'ACTIVE_SHIP', label: 'Active Ship' },
  { value: 'ASSET_SAFETY', label: 'Asset Safety' },
  { value: 'CONTRACTS', label: 'Contracts' },
  { value: 'DELIVERIES', label: 'Deliveries' },
  { value: 'INDUSTRY_JOBS', label: 'Industry' },
  { value: 'ITEM_HANGAR', label: 'Item Hangar' },
  { value: 'MARKET_ORDERS', label: 'Market Orders' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'SHIP_HANGAR', label: 'Ship Hangar' },
  { value: 'STRUCTURES', label: 'Structures' },
]

const EXCLUDED_FILTER_VALUES = new Set(
  ASSET_SETTINGS_CONFIG.map((c) => c.filterValue)
)

const SEARCH_DEBOUNCE_MS = 250

function ExpandCollapseButton() {
  const { expandCollapse } = useTabControls()

  if (!expandCollapse) return null

  return (
    <button
      onClick={expandCollapse.toggle}
      className="flex items-center gap-1 rounded border border-border bg-surface-tertiary px-2.5 py-1 text-sm hover:bg-surface-tertiary/70"
      title={expandCollapse.isExpanded ? 'Collapse all' : 'Expand all'}
      aria-expanded={expandCollapse.isExpanded}
    >
      {expandCollapse.isExpanded ? (
        <>
          <ChevronsDownUp className="h-3.5 w-3.5" />
          Collapse
        </>
      ) : (
        <>
          <ChevronsUpDown className="h-3.5 w-3.5" />
          Expand
        </>
      )}
    </button>
  )
}

function ColumnsDropdown() {
  const { columns } = useTabControls()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const closeDropdown = useCallback(() => setOpen(false), [])

  useClickOutside(dropdownRef, open, closeDropdown)

  if (columns.length === 0) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = dropdownRef.current?.querySelectorAll(
        '[role="menuitemcheckbox"]'
      )
      if (!items?.length) return
      const currentIndex = Array.from(items).findIndex(
        (item) => item === document.activeElement
      )
      const nextIndex =
        e.key === 'ArrowDown'
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length
      ;(items[nextIndex] as HTMLElement)?.focus()
    }
  }

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 rounded border border-border bg-surface-tertiary px-2.5 py-1 text-sm hover:bg-surface-tertiary/70"
      >
        Columns <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded border border-border bg-surface-secondary py-1 shadow-lg"
        >
          {columns.map((col) => (
            <button
              key={col.id}
              role="menuitemcheckbox"
              aria-checked={col.visible}
              onClick={() => col.toggle()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-tertiary focus:bg-surface-tertiary focus:outline-hidden"
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {col.visible && <Check className="h-4 w-4 text-accent" />}
              </span>
              {col.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SearchBar() {
  const {
    search,
    setSearch,
    categoryFilter,
    assetTypeFilter,
    resultCount,
    totalValue,
  } = useTabControls()
  const [inputValue, setInputValue] = useState(search)
  const settings = useAssetSettings()

  const filteredTypeOptions = useMemo(() => {
    return ASSET_TYPE_OPTIONS.filter((opt) => {
      if (!EXCLUDED_FILTER_VALUES.has(opt.value)) return true
      const config = ASSET_SETTINGS_CONFIG.find(
        (c) => c.filterValue === opt.value
      )
      return config ? settings[config.key] : true
    })
  }, [settings])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setSearchRef = useRef(setSearch)

  useEffect(() => {
    setSearchRef.current = setSearch
  }, [setSearch])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleChange = (value: string) => {
    setInputValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchRef.current(value)
    }, SEARCH_DEBOUNCE_MS)
  }

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setInputValue('')
    setSearchRef.current('')
  }

  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface-secondary/50 px-4 py-2">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
        <input
          type="text"
          placeholder="Search name, group, location, system, region..."
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          aria-label="Search assets"
          className="w-full rounded border border-border bg-surface-tertiary pl-9 pr-8 py-1.5 text-sm placeholder-content-muted focus:border-accent focus:outline-hidden"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {assetTypeFilter && (
        <select
          value={assetTypeFilter.value}
          onChange={(e) => assetTypeFilter.onChange(e.target.value)}
          aria-label="Filter by asset type"
          className="w-36 rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden"
        >
          {filteredTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {categoryFilter && (
        <select
          value={categoryFilter.value}
          onChange={(e) => categoryFilter.onChange(e.target.value)}
          aria-label="Filter by category"
          className="w-40 rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden"
        >
          <option value="">All Categories</option>
          {categoryFilter.categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      )}

      {totalValue !== null && (
        <span className="text-sm">
          <span className="text-content-secondary">
            {totalValue.label ?? 'Value'}:{' '}
          </span>
          <span className="text-semantic-positive">
            {formatNumber(totalValue.value)} ISK
          </span>
          {totalValue.secondaryValue !== undefined && (
            <>
              <span className="text-content-muted mx-2">|</span>
              <span className="text-content-secondary">
                {totalValue.secondaryLabel ?? 'Secondary'}:{' '}
              </span>
              <span className="text-semantic-warning">
                {formatNumber(totalValue.secondaryValue)} ISK
              </span>
            </>
          )}
          {totalValue.tertiaryValue !== undefined && (
            <>
              <span className="text-content-muted mx-2">|</span>
              <span className="text-content-secondary">
                {totalValue.tertiaryLabel ?? 'Tertiary'}:{' '}
              </span>
              <span className="text-accent">
                {formatNumber(totalValue.tertiaryValue)} ISK
              </span>
            </>
          )}
        </span>
      )}

      {resultCount && (
        <span
          role="status"
          aria-live="polite"
          className="text-sm text-content-secondary"
        >
          Showing {resultCount.showing.toLocaleString()} of{' '}
          {resultCount.total.toLocaleString()}
        </span>
      )}

      <div className="flex-1" />

      <ExpandCollapseButton />
      <ColumnsDropdown />
    </div>
  )
}
