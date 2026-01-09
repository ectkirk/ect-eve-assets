import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import {
  ChevronDown,
  Check,
  ChevronsUpDown,
  ChevronsDownUp,
  Search,
  X,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useTabControls,
  MAIL_FILTER_OPTIONS,
  ORDER_TYPE_OPTIONS,
  type OrderTypeValue,
} from '@/context'
import { CorporationLogo } from '@/components/ui/type-icon'
import { cn, formatNumber, formatFullNumber } from '@/lib/utils'
import {
  useAssetSettings,
  ASSET_SETTINGS_CONFIG,
} from '@/store/asset-settings-store'
import { useClickOutside } from '@/hooks'

const ASSET_TYPE_KEYS: { value: string; key: string }[] = [
  { value: '', key: 'searchBar.assetTypes.all' },
  { value: 'ACTIVE_SHIP', key: 'searchBar.assetTypes.activeShip' },
  { value: 'ASSET_SAFETY', key: 'searchBar.assetTypes.assetSafety' },
  { value: 'CONTRACTS', key: 'searchBar.assetTypes.contracts' },
  { value: 'DELIVERIES', key: 'searchBar.assetTypes.deliveries' },
  { value: 'INDUSTRY_JOBS', key: 'searchBar.assetTypes.industry' },
  { value: 'ITEM_HANGAR', key: 'searchBar.assetTypes.itemHangar' },
  { value: 'MARKET_ORDERS', key: 'searchBar.assetTypes.marketOrders' },
  { value: 'OFFICE', key: 'searchBar.assetTypes.office' },
  { value: 'SHIP_HANGAR', key: 'searchBar.assetTypes.shipHangar' },
  { value: 'STRUCTURES', key: 'searchBar.assetTypes.structures' },
]

const EXCLUDED_FILTER_VALUES = new Set(
  ASSET_SETTINGS_CONFIG.map((c) => c.filterValue)
)

const SEARCH_DEBOUNCE_MS = 250
const MAX_LOYALTY_CORPS_DISPLAY = 6

const ORDER_TYPE_KEYS: Record<OrderTypeValue, string> = {
  all: 'searchBar.orderTypes.all',
  sell: 'searchBar.orderTypes.sell',
  buy: 'searchBar.orderTypes.buy',
}

function RefreshButton() {
  const { t } = useTranslation('common')
  const { refreshAction } = useTabControls()

  if (!refreshAction) return null

  return (
    <button
      onClick={refreshAction.onRefresh}
      disabled={refreshAction.isRefreshing}
      className="flex items-center gap-1 rounded border border-border bg-surface-tertiary px-2.5 py-1 text-sm hover:bg-surface-tertiary/70 disabled:opacity-50"
      title={t('searchBar.refresh')}
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${refreshAction.isRefreshing ? 'animate-spin' : ''}`}
      />
      {t('searchBar.refresh')}
    </button>
  )
}

function ExpandCollapseButton() {
  const { t } = useTranslation('common')
  const { expandCollapse } = useTabControls()

  if (!expandCollapse) return null

  return (
    <button
      onClick={expandCollapse.toggle}
      className="flex items-center gap-1 rounded border border-border bg-surface-tertiary px-2.5 py-1 text-sm hover:bg-surface-tertiary/70"
      title={
        expandCollapse.isExpanded
          ? t('searchBar.collapseAll')
          : t('searchBar.expandAll')
      }
      aria-expanded={expandCollapse.isExpanded}
    >
      {expandCollapse.isExpanded ? (
        <>
          <ChevronsDownUp className="h-3.5 w-3.5" />
          {t('searchBar.collapse')}
        </>
      ) : (
        <>
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {t('searchBar.expand')}
        </>
      )}
    </button>
  )
}

function ColumnsDropdown() {
  const { t } = useTranslation('common')
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
        {t('searchBar.columns')} <ChevronDown className="h-3.5 w-3.5" />
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
              {t(col.label)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SearchBar() {
  const { t } = useTranslation('common')
  const {
    search,
    setSearch,
    searchPlaceholder,
    categoryFilter,
    assetTypeFilter,
    resultCount,
    totalValue,
    mailFilter,
    loyaltyCorporations,
    orderTypeFilter,
  } = useTabControls()
  const [inputValue, setInputValue] = useState(search)
  const settings = useAssetSettings()

  const filteredTypeOptions = useMemo(() => {
    return ASSET_TYPE_KEYS.filter((opt) => {
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
          placeholder={searchPlaceholder ?? t('search.placeholder')}
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          aria-label={t('accessibility.search')}
          className="w-full rounded border border-border bg-surface-tertiary pl-9 pr-8 py-1.5 text-sm placeholder-content-muted focus:border-accent focus:outline-hidden"
        />
        {inputValue && (
          <button
            onClick={handleClear}
            aria-label={t('accessibility.clearSearch')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {mailFilter && (
        <div className="flex gap-1">
          {MAIL_FILTER_OPTIONS.map((type) => (
            <button
              key={type}
              onClick={() => mailFilter.onChange(type)}
              className={cn(
                'rounded px-3 py-1 text-sm capitalize transition-colors',
                mailFilter.value === type
                  ? 'bg-accent text-white'
                  : 'bg-surface-tertiary text-content-muted hover:bg-surface-tertiary/80'
              )}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {loyaltyCorporations && loyaltyCorporations.corporations.length > 0 && (
        <div className="flex items-center gap-3 overflow-x-auto">
          {loyaltyCorporations.corporations
            .slice(0, MAX_LOYALTY_CORPS_DISPLAY)
            .map((corp) => (
              <div key={corp.id} className="flex items-center gap-1.5 shrink-0">
                <CorporationLogo corporationId={corp.id} size="sm" />
                <span
                  className="text-xs text-content-secondary truncate max-w-20"
                  title={corp.name}
                >
                  {corp.name}
                </span>
                <span className="text-xs tabular-nums text-semantic-positive">
                  {formatNumber(corp.total)}
                </span>
              </div>
            ))}
          {loyaltyCorporations.corporations.length >
            MAX_LOYALTY_CORPS_DISPLAY && (
            <span className="text-xs text-content-muted shrink-0">
              {t('searchBar.more', {
                count:
                  loyaltyCorporations.corporations.length -
                  MAX_LOYALTY_CORPS_DISPLAY,
              })}
            </span>
          )}
        </div>
      )}

      {orderTypeFilter && (
        <select
          value={orderTypeFilter.value}
          onChange={(e) =>
            orderTypeFilter.onChange(e.target.value as OrderTypeValue)
          }
          aria-label={t('accessibility.filterByOrderType')}
          className="w-32 rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden"
        >
          {ORDER_TYPE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t(ORDER_TYPE_KEYS[opt])}
            </option>
          ))}
        </select>
      )}

      {assetTypeFilter && (
        <select
          value={assetTypeFilter.value}
          onChange={(e) => assetTypeFilter.onChange(e.target.value)}
          aria-label={t('accessibility.filterByAssetType')}
          className="w-36 rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden"
        >
          {filteredTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.key)}
            </option>
          ))}
        </select>
      )}

      {categoryFilter && (
        <select
          value={categoryFilter.value}
          onChange={(e) => categoryFilter.onChange(e.target.value)}
          aria-label={t('accessibility.filterByCategory')}
          className="w-40 rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden"
        >
          <option value="">{t('searchBar.allCategories')}</option>
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
            {totalValue.label ?? t('columns.value')}:{' '}
          </span>
          <span className="text-semantic-positive">
            {formatNumber(totalValue.value)}
          </span>
          {totalValue.secondaryValue !== undefined && (
            <>
              <span className="text-content-muted mx-2">|</span>
              <span className="text-content-secondary">
                {totalValue.secondaryLabel ?? 'Secondary'}:{' '}
              </span>
              <span className="text-semantic-warning">
                {formatNumber(totalValue.secondaryValue)}
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
                {formatNumber(totalValue.tertiaryValue)}
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
          {t('searchBar.showing', {
            showing: formatFullNumber(resultCount.showing),
            total: formatFullNumber(resultCount.total),
          })}
        </span>
      )}

      <div className="flex-1" />

      <RefreshButton />
      <ExpandCollapseButton />
      <ColumnsDropdown />
    </div>
  )
}
