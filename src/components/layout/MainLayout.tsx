import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { AssetsTab } from '@/features/assets'
import { StructuresTab } from '@/features/structures'
import { AssetsTreeTab } from '@/features/assets-tree'
import { MarketOrdersTab } from '@/features/market-orders'
import { IndustryJobsTab } from '@/features/industry-jobs'
import { ClonesTab } from '@/features/clones'
import { LoyaltyTab } from '@/features/loyalty'
import { ContractsTab } from '@/features/contracts'
import { WalletTab } from '@/features/wallet'
import { ManufacturingTab } from '@/features/manufacturing'
import { BlueprintResearchTab, CopyingTab } from '@/features/research'
import { CalculatorTab } from '@/features/calculator'
import { BuybackTab, BUYBACK_TABS, getConfigByTabName, type BuybackTabType } from '@/features/buyback'
import { Loader2, ChevronDown, Check, ChevronsUpDown, ChevronsDownUp, Search, X, AlertTriangle, Minus, Square, Copy, Settings, Info, Heart, Shield, FileText, History, Trash2, Sparkles, Bug, FolderOpen } from 'lucide-react'
import { useThemeStore, THEME_OPTIONS } from '@/store/theme-store'
import eveSsoLoginWhite from '/eve-sso-login-white.png'
import { OwnerIcon } from '@/components/ui/type-icon'
import { OwnerManagementModal } from './OwnerManagementModal'
import { CreditsModal } from './CreditsModal'
import { SupportModal } from './SupportModal'
import { BugReportModal } from './BugReportModal'
import { ChangelogModal } from './ChangelogModal'
import { UpdateBanner } from './UpdateBanner'
import { ToastContainer } from './ToastContainer'
import { ClearCacheModal } from '@/components/dialogs/ClearCacheModal'
import { AbyssalSyncModal } from '@/components/dialogs/AbyssalSyncModal'
import { useTotalAssets } from '@/hooks'
import { formatNumber } from '@/lib/utils'
import { TabControlsProvider, useTabControls } from '@/context'

type AppMode = 'assets' | 'tools' | 'buyback'

const ASSET_TABS = [
  'Assets',
  'Assets Tree',
  'Clones',
  'Contracts',
  'Industry Jobs',
  'Loyalty Points',
  'Market Orders',
  'Structures',
  'Wallet',
] as const

const TOOL_TABS = [
  'Manufacturing',
  'Research',
  'Copying',
  'Calculator',
] as const

type AssetTab = (typeof ASSET_TABS)[number]
type ToolTab = (typeof TOOL_TABS)[number]

function AssetTabContent({ tab }: { tab: AssetTab }) {
  switch (tab) {
    case 'Assets':
      return <AssetsTab />
    case 'Assets Tree':
      return <AssetsTreeTab />
    case 'Structures':
      return <StructuresTab />
    case 'Market Orders':
      return <MarketOrdersTab />
    case 'Industry Jobs':
      return <IndustryJobsTab />
    case 'Clones':
      return <ClonesTab />
    case 'Contracts':
      return <ContractsTab />
    case 'Loyalty Points':
      return <LoyaltyTab />
    case 'Wallet':
      return <WalletTab />
  }
}

function ToolTabContent({ tab }: { tab: ToolTab }) {
  switch (tab) {
    case 'Manufacturing':
      return <ManufacturingTab />
    case 'Research':
      return <BlueprintResearchTab />
    case 'Copying':
      return <CopyingTab />
    case 'Calculator':
      return <CalculatorTab />
  }
}

function ModeSwitcher({ mode, onModeChange }: { mode: AppMode; onModeChange: (mode: AppMode) => void }) {
  return (
    <div className="flex rounded-md bg-surface-tertiary/50 p-0.5">
      <button
        onClick={() => onModeChange('assets')}
        className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
          mode === 'assets'
            ? 'bg-surface-tertiary text-content'
            : 'text-content-muted hover:text-content-secondary'
        }`}
      >
        Assets
      </button>
      <button
        onClick={() => onModeChange('tools')}
        className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
          mode === 'tools'
            ? 'bg-surface-tertiary text-content'
            : 'text-content-muted hover:text-content-secondary'
        }`}
      >
        Tools
      </button>
      <button
        onClick={() => onModeChange('buyback')}
        className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
          mode === 'buyback'
            ? 'bg-surface-tertiary text-content'
            : 'text-content-muted hover:text-content-secondary'
        }`}
      >
        Buyback
      </button>
    </div>
  )
}

function RefreshStatus() {
  const currentlyRefreshing = useExpiryCacheStore((s) => s.currentlyRefreshing)
  const owners = useAuthStore((s) => s.owners)

  if (!currentlyRefreshing) return null

  const owner = owners[currentlyRefreshing.ownerKey]
  const ownerName = owner?.name ?? 'Unknown'

  return (
    <div className="flex items-center gap-2 text-sm text-content-secondary">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>Updating {ownerName}</span>
    </div>
  )
}

function OwnerButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const [isAddingOwner, setIsAddingOwner] = useState(false)
  const [isUpdatingData, setIsUpdatingData] = useState(false)

  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])
  const selectedOwnerIds = useAuthStore((state) => state.selectedOwnerIds)

  const selectedOwners = useMemo(
    () => owners.filter((o) => selectedOwnerIds.includes(ownerKey(o.type, o.id))),
    [owners, selectedOwnerIds]
  )

  const hasAuthFailure = useMemo(
    () => owners.some((o) => o.authFailed),
    [owners]
  )

  const hasScopesOutdated = useMemo(
    () => owners.some((o) => o.scopesOutdated && !o.authFailed),
    [owners]
  )

  const handleAddFirstCharacter = async () => {
    if (!window.electronAPI) return

    setIsAddingOwner(true)
    try {
      const result = await window.electronAPI.startAuth()
      if (
        result.success &&
        result.accessToken &&
        result.refreshToken &&
        result.characterId &&
        result.characterName &&
        result.corporationId
      ) {
        useAuthStore.getState().addOwner({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
          scopes: result.scopes,
          owner: {
            id: result.characterId,
            type: 'character',
            name: result.characterName,
            characterId: result.characterId,
            corporationId: result.corporationId,
          },
        })
        setIsAddingOwner(false)
        setIsUpdatingData(true)
        useExpiryCacheStore.getState().queueAllEndpointsForOwner(ownerKey('character', result.characterId))
        setIsUpdatingData(false)
      }
    } finally {
      setIsAddingOwner(false)
      setIsUpdatingData(false)
    }
  }

  if (isUpdatingData) {
    return (
      <div className="flex items-center gap-2 text-sm text-content-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Updating data...
      </div>
    )
  }

  if (owners.length === 0) {
    return (
      <button
        onClick={handleAddFirstCharacter}
        disabled={isAddingOwner}
        className="transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {isAddingOwner ? (
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Logging in...
          </div>
        ) : (
          <img src={eveSsoLoginWhite} alt="Log in with EVE Online" className="h-8" />
        )}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-tertiary"
      >
        {hasAuthFailure && (
          <span title="Auth failure - click to re-authenticate">
            <AlertTriangle className="h-4 w-4 text-semantic-danger" />
          </span>
        )}
        {hasScopesOutdated && !hasAuthFailure && (
          <span title="Scopes outdated - click to upgrade">
            <AlertTriangle className="h-4 w-4 text-semantic-warning" />
          </span>
        )}
        {selectedOwners.length === 0 ? (
          <span className="text-sm text-content-muted">No Selection</span>
        ) : (
          <div className="flex items-center gap-3">
            {(() => {
              const selectedCharacters = selectedOwners.filter((o) => o.type === 'character').slice(0, 5)
              const selectedCorps = selectedOwners.filter((o) => o.type === 'corporation').slice(0, 5)
              const totalCharacters = owners.filter((o) => o.type === 'character').length
              const totalCorps = owners.filter((o) => o.type === 'corporation').length
              return (
                <>
                  {totalCharacters > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="flex items-center">
                        {selectedCharacters.map((owner, i) => (
                          <div
                            key={ownerKey(owner.type, owner.id)}
                            className="relative rounded-full ring-2 ring-surface-secondary"
                            style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }}
                          >
                            <OwnerIcon ownerId={owner.id} ownerType={owner.type} size="lg" />
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-content-secondary">
                        ({selectedOwners.filter((o) => o.type === 'character').length}/{totalCharacters})
                      </span>
                    </div>
                  )}
                  {totalCorps > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="flex items-center">
                        {selectedCorps.map((owner, i) => (
                          <div
                            key={ownerKey(owner.type, owner.id)}
                            className="relative rounded-full ring-2 ring-surface-secondary"
                            style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 5 - i }}
                          >
                            <OwnerIcon ownerId={owner.id} ownerType={owner.type} size="lg" />
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-content-secondary">
                        ({selectedOwners.filter((o) => o.type === 'corporation').length}/{totalCorps})
                      </span>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </button>
      <OwnerManagementModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}


function ExpandCollapseButton() {
  const { expandCollapse } = useTabControls()

  if (!expandCollapse) return null

  return (
    <button
      onClick={expandCollapse.toggle}
      className="flex items-center gap-1 rounded border border-border bg-surface-tertiary px-2.5 py-1 text-sm hover:bg-surface-tertiary/70"
      title={expandCollapse.isExpanded ? 'Collapse all' : 'Expand all'}
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

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  if (columns.length === 0) return null

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded border border-border bg-surface-tertiary px-2.5 py-1 text-sm hover:bg-surface-tertiary/70"
      >
        Columns <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded border border-border bg-surface-secondary py-1 shadow-lg">
          {columns.map((col) => (
            <button
              key={col.id}
              onClick={() => col.toggle()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-tertiary"
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

function ComparisonLevelDropdown() {
  const { comparisonLevel } = useTabControls()

  if (!comparisonLevel) return null

  return (
    <select
      value={comparisonLevel.value}
      onChange={(e) => comparisonLevel.onChange(e.target.value as 'station' | 'system' | 'region')}
      className="rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden"
    >
      <option value="station">Station</option>
      <option value="system">System</option>
      <option value="region">Region</option>
    </select>
  )
}

const ASSET_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
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

const SEARCH_DEBOUNCE_MS = 250

function SearchBar() {
  const { search, setSearch, categoryFilter, assetTypeFilter, resultCount, totalValue } = useTabControls()
  const [inputValue, setInputValue] = useState(search)
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
          className="w-full rounded border border-border bg-surface-tertiary pl-9 pr-8 py-1.5 text-sm placeholder-content-muted focus:border-accent focus:outline-hidden"
        />
        {inputValue && (
          <button
            onClick={handleClear}
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
          className="w-36 rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden"
        >
          {ASSET_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {categoryFilter && (
        <select
          value={categoryFilter.value}
          onChange={(e) => categoryFilter.onChange(e.target.value)}
          className="w-40 rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm focus:border-accent focus:outline-hidden"
        >
          <option value="">All Categories</option>
          {categoryFilter.categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      )}

      {totalValue !== null && (
        <span className="text-sm">
          <span className="text-content-secondary">{totalValue.label ?? 'Value'}: </span>
          <span className="text-semantic-positive">{formatNumber(totalValue.value)} ISK</span>
          {totalValue.secondaryValue !== undefined && (
            <>
              <span className="text-content-muted mx-2">|</span>
              <span className="text-content-secondary">{totalValue.secondaryLabel ?? 'Secondary'}: </span>
              <span className="text-semantic-warning">{formatNumber(totalValue.secondaryValue)} ISK</span>
            </>
          )}
          {totalValue.tertiaryValue !== undefined && (
            <>
              <span className="text-content-muted mx-2">|</span>
              <span className="text-content-secondary">{totalValue.tertiaryLabel ?? 'Tertiary'}: </span>
              <span className="text-accent">{formatNumber(totalValue.tertiaryValue)} ISK</span>
            </>
          )}
        </span>
      )}

      {resultCount && (
        <span className="text-sm text-content-secondary">
          Showing {resultCount.showing.toLocaleString()} of {resultCount.total.toLocaleString()}
        </span>
      )}

      <div className="flex-1" />

      <ComparisonLevelDropdown />
      <ExpandCollapseButton />
      <ColumnsDropdown />
    </div>
  )
}

function HeaderControls() {
  const totals = useTotalAssets()
  const hasData = useAssetStore((s) => s.assetsByOwner.length > 0)

  return (
    <div className="flex items-center gap-4">
      {hasData && (
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-content-secondary">Total: </span>
            <span className="font-medium text-semantic-positive">{formatNumber(totals.total)} ISK</span>
          </div>
          <div>
            <span className="text-content-secondary">Assets: </span>
            <span className="font-medium text-accent">{formatNumber(totals.assetsTotal)}</span>
          </div>
          <div>
            <span className="text-content-secondary">Market: </span>
            <span className="font-medium text-status-info">{formatNumber(totals.marketTotal)}</span>
          </div>
          <div>
            <span className="text-content-secondary">Industry: </span>
            <span className="font-medium text-semantic-warning">{formatNumber(totals.industryTotal)}</span>
          </div>
          <div>
            <span className="text-content-secondary">Contracts: </span>
            <span className="font-medium text-status-corp">{formatNumber(totals.contractsTotal)}</span>
          </div>
          <div>
            <span className="text-content-secondary">Wallet: </span>
            <span className="font-medium text-semantic-success">{formatNumber(totals.walletTotal)}</span>
          </div>
          <div>
            <span className="text-content-secondary">Structures: </span>
            <span className="font-medium text-status-special">{formatNumber(totals.structuresTotal)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [showClearCacheModal, setShowClearCacheModal] = useState(false)
  const [showAbyssalModal, setShowAbyssalModal] = useState(false)
  const [showBugReportModal, setShowBugReportModal] = useState(false)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.windowIsMaximized().then(setIsMaximized)
    return window.electronAPI.onWindowMaximizeChange(setIsMaximized)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (settingsPanelRef.current && !settingsPanelRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [settingsOpen])

  return (
    <div className="flex items-center -mr-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <div ref={settingsPanelRef} className="relative">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-surface-tertiary hover:text-content"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        {settingsOpen && (
          <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-surface-secondary shadow-lg z-50">
            <div className="p-3 border-b border-border">
              <span className="text-sm font-medium text-content-secondary">Settings</span>
            </div>
            <div className="p-2">
              <div className="px-2 py-1.5">
                <label className="text-xs text-content-muted mb-1 block">Theme</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as typeof theme)}
                  className="w-full rounded border border-border bg-surface-tertiary px-2 py-1.5 text-sm text-content-secondary focus:border-accent focus:outline-hidden"
                >
                  {THEME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => {
                  setShowAbyssalModal(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Sparkles className="h-4 w-4" />
                Abyssal Pricing
              </button>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => {
                  setChangelogOpen(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <History className="h-4 w-4" />
                Changelog
              </button>
              <button
                onClick={() => {
                  setCreditsOpen(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Info className="h-4 w-4" />
                Credits
              </button>
              <button
                onClick={() => {
                  setSupportOpen(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Heart className="h-4 w-4" />
                Support Us
              </button>
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => {
                  window.electronAPI?.openLogsFolder()
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <FolderOpen className="h-4 w-4" />
                Open Logs Folder
              </button>
              <button
                onClick={() => {
                  setShowBugReportModal(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Bug className="h-4 w-4" />
                Report A Bug
              </button>
              <div className="my-2 border-t border-border" />
              <a
                href="https://edencom.net/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <Shield className="h-4 w-4" />
                Privacy Policy
              </a>
              <a
                href="https://edencom.net/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-content-secondary hover:bg-surface-tertiary"
              >
                <FileText className="h-4 w-4" />
                Terms of Service
              </a>
              <div className="my-2 border-t border-semantic-danger/30" />
              <button
                onClick={() => {
                  setShowClearCacheModal(true)
                  setSettingsOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-semantic-danger hover:bg-semantic-danger/10"
              >
                <Trash2 className="h-4 w-4" />
                Clear Cache...
              </button>
            </div>
          </div>
        )}
      </div>
      <ChangelogModal open={changelogOpen} onOpenChange={setChangelogOpen} />
      <CreditsModal open={creditsOpen} onOpenChange={setCreditsOpen} />
      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
      <ClearCacheModal open={showClearCacheModal} onOpenChange={setShowClearCacheModal} />
      <AbyssalSyncModal open={showAbyssalModal} onOpenChange={setShowAbyssalModal} />
      <BugReportModal open={showBugReportModal} onOpenChange={setShowBugReportModal} />
      <button
        onClick={() => window.electronAPI?.windowMinimize()}
        className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-surface-tertiary hover:text-content"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => window.electronAPI?.windowMaximize()}
        className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-surface-tertiary hover:text-content"
      >
        {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => window.electronAPI?.windowClose()}
        className="flex h-10 w-12 items-center justify-center text-content-secondary hover:bg-semantic-danger hover:text-content"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function MainLayoutInner() {
  const [mode, setMode] = useState<AppMode>('assets')
  const [activeAssetTab, setActiveAssetTab] = useState<AssetTab>('Assets')
  const [activeToolTab, setActiveToolTab] = useState<ToolTab>('Manufacturing')
  const [activeBuybackTab, setActiveBuybackTab] = useState<BuybackTabType>(BUYBACK_TABS[1])

  return (
    <div className="flex h-full flex-col">
      <ToastContainer />
      <UpdateBanner />
      {/* Header */}
      <header
        className="flex items-center border-b border-border bg-surface-secondary px-4 py-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex flex-col" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="text-lg font-bold tracking-tight text-content">
            <span className="text-accent">ECT</span> EVE Assets
          </span>
          <span className="text-[10px] tracking-[0.2em] text-content-secondary">
            We Like The Data
          </span>
        </div>
        <div className="mx-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ModeSwitcher mode={mode} onModeChange={setMode} />
        </div>
        <a
          href="https://discord.gg/dexSsJYYbv"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-2 text-content-secondary transition-colors hover:text-[#5865F2]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label="Join our Discord server"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </a>
        <div className="mx-4">
          <RefreshStatus />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <HeaderControls />
          <WindowControls />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex items-center border-b border-border bg-surface-secondary px-2">
        <div className="flex gap-1">
          {mode === 'assets' ? (
            ASSET_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveAssetTab(tab)}
                className={`px-3 py-2 text-sm transition-colors ${
                  activeAssetTab === tab
                    ? 'border-b-2 border-accent text-accent'
                    : 'text-content-secondary hover:text-content'
                }`}
              >
                {tab}
              </button>
            ))
          ) : mode === 'tools' ? (
            TOOL_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveToolTab(tab)}
                className={`px-3 py-2 text-sm transition-colors ${
                  activeToolTab === tab
                    ? 'border-b-2 border-accent text-accent'
                    : 'text-content-secondary hover:text-content'
                }`}
              >
                {tab}
              </button>
            ))
          ) : (
            BUYBACK_TABS.map((tab) => {
              const config = getConfigByTabName(tab)
              return (
                <button
                  key={tab}
                  onClick={() => setActiveBuybackTab(tab)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    activeBuybackTab === tab
                      ? 'border-b-2 border-accent text-accent'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  {config && <span className={`h-2 w-2 rounded-full ${config.color}`} />}
                  {tab}
                </button>
              )
            })
          )}
        </div>
        <div className="flex-1" />
        <OwnerButton />
      </nav>

      {/* Search Bar - only for assets mode */}
      {mode === 'assets' && <SearchBar />}

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-4">
        {mode === 'assets' ? (
          <AssetTabContent tab={activeAssetTab} />
        ) : mode === 'tools' ? (
          <ToolTabContent tab={activeToolTab} />
        ) : (
          <BuybackTab activeTab={activeBuybackTab} />
        )}
      </main>
    </div>
  )
}

export function MainLayout() {
  return (
    <TabControlsProvider>
      <MainLayoutInner />
    </TabControlsProvider>
  )
}
