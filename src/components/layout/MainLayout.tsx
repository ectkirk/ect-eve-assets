import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import { AssetsTab } from '@/features/assets'
import { ItemHangarTab } from '@/features/item-hangar'
import { ShipHangarTab } from '@/features/ship-hangar'
import { DeliveriesTab } from '@/features/deliveries'
import { AssetSafetyTab } from '@/features/asset-safety'
import { OfficeTab } from '@/features/office'
import { StructuresTab } from '@/features/structures'
import { MarketOrdersTab } from '@/features/market-orders'
import { IndustryJobsTab } from '@/features/industry-jobs'
import { ClonesTab } from '@/features/clones'
import { ContractsTab } from '@/features/contracts'
import { WalletTab } from '@/features/wallet'
import { ManufacturingTab } from '@/features/manufacturing'
import { BlueprintResearchTab, CopyingTab } from '@/features/research'
import { CalculatorTab } from '@/features/calculator'
import { BuybackTab, BUYBACK_TABS, type BuybackTabType } from '@/features/buyback'
import { Loader2, ChevronDown, Check, ChevronsUpDown, ChevronsDownUp, Search, X, User, AlertTriangle, Minus, Square, Copy, Settings } from 'lucide-react'
import { useSettingsStore } from '@/store/settings-store'
import eveSsoLoginWhite from '/eve-sso-login-white.png'
import { OwnerIcon } from '@/components/ui/type-icon'
import { OwnerManagementModal } from './OwnerManagementModal'
import { UpdateBanner } from './UpdateBanner'
import { ToastContainer } from './ToastContainer'
import { useTotalAssets } from '@/hooks'
import { formatNumber } from '@/lib/utils'
import { TabControlsProvider, useTabControls } from '@/context'

type AppMode = 'assets' | 'tools' | 'buyback'

const ASSET_TABS = [
  'Assets',
  'Item Hangar',
  'Ship Hangar',
  'Deliveries',
  'Asset Safety',
  'Market Orders',
  'Industry Jobs',
  'Clones',
  'Office',
  'Structures',
  'Contracts',
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
    case 'Item Hangar':
      return <ItemHangarTab />
    case 'Ship Hangar':
      return <ShipHangarTab />
    case 'Deliveries':
      return <DeliveriesTab />
    case 'Asset Safety':
      return <AssetSafetyTab />
    case 'Office':
      return <OfficeTab />
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
    <div className="flex rounded-md bg-slate-700/50 p-0.5">
      <button
        onClick={() => onModeChange('assets')}
        className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
          mode === 'assets'
            ? 'bg-slate-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Assets
      </button>
      <button
        onClick={() => onModeChange('tools')}
        className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
          mode === 'tools'
            ? 'bg-slate-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        Tools
      </button>
      <button
        onClick={() => onModeChange('buyback')}
        className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
          mode === 'buyback'
            ? 'bg-slate-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
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
    <div className="flex items-center gap-2 text-sm text-slate-400">
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
  const activeOwnerId = useAuthStore((state) => state.activeOwnerId)

  const activeOwner = useMemo(
    () => owners.find((o) => ownerKey(o.type, o.id) === activeOwnerId),
    [owners, activeOwnerId]
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
      <div className="flex items-center gap-2 text-sm text-slate-400">
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
          <div className="flex items-center gap-2 text-sm text-slate-400">
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
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-700"
      >
        {hasAuthFailure && (
          <span title="Auth failure - click to re-authenticate">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </span>
        )}
        {hasScopesOutdated && !hasAuthFailure && (
          <span title="Scopes outdated - click to upgrade">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </span>
        )}
        {activeOwnerId === null ? (
          <>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600">
              <User className="h-4 w-4 text-slate-300" />
            </div>
            <span className="text-sm">All Characters</span>
            <span className="text-xs text-slate-400">({owners.length})</span>
          </>
        ) : activeOwner ? (
          <>
            <OwnerIcon ownerId={activeOwner.id} ownerType={activeOwner.type} size="lg" />
            <span
              className={`text-sm ${activeOwner.type === 'corporation' ? 'text-yellow-400' : ''}`}
            >
              {activeOwner.name}
            </span>
            {owners.length > 1 && (
              <span className="text-xs text-slate-400">
                +{owners.length - 1}
              </span>
            )}
          </>
        ) : null}
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
      className="flex items-center gap-1 rounded border border-slate-600 bg-slate-700 px-2.5 py-1 text-sm hover:bg-slate-600"
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
        className="flex items-center gap-1 rounded border border-slate-600 bg-slate-700 px-2.5 py-1 text-sm hover:bg-slate-600"
      >
        Columns <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded border border-slate-600 bg-slate-800 py-1 shadow-lg">
          {columns.map((col) => (
            <button
              key={col.id}
              onClick={() => col.toggle()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-700"
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {col.visible && <Check className="h-4 w-4 text-blue-400" />}
              </span>
              {col.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchBar() {
  const { search, setSearch, categoryFilter, resultCount, totalValue } = useTabControls()

  return (
    <div className="flex items-center gap-3 border-b border-slate-700 bg-slate-800/50 px-4 py-2">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search name, group, location, system, region..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-slate-600 bg-slate-700 pl-9 pr-8 py-1.5 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {categoryFilter && (
        <select
          value={categoryFilter.value}
          onChange={(e) => categoryFilter.onChange(e.target.value)}
          className="w-40 rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-hidden"
        >
          <option value="">All Categories</option>
          {categoryFilter.categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      )}

      {totalValue !== null && (
        <span className="text-sm">
          <span className="text-slate-400">{totalValue.label ?? 'Value'}: </span>
          <span className="text-green-400">{formatNumber(totalValue.value)} ISK</span>
          {totalValue.secondaryValue !== undefined && (
            <>
              <span className="text-slate-500 mx-2">|</span>
              <span className="text-slate-400">{totalValue.secondaryLabel ?? 'Secondary'}: </span>
              <span className="text-amber-400">{formatNumber(totalValue.secondaryValue)} ISK</span>
            </>
          )}
          {totalValue.tertiaryValue !== undefined && (
            <>
              <span className="text-slate-500 mx-2">|</span>
              <span className="text-slate-400">{totalValue.tertiaryLabel ?? 'Tertiary'}: </span>
              <span className="text-blue-400">{formatNumber(totalValue.tertiaryValue)} ISK</span>
            </>
          )}
        </span>
      )}

      {resultCount && (
        <span className="text-sm text-slate-400">
          Showing {resultCount.showing.toLocaleString()} of {resultCount.total.toLocaleString()}
        </span>
      )}
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
            <span className="text-slate-400">Total: </span>
            <span className="font-medium text-green-400">{formatNumber(totals.total)} ISK</span>
          </div>
          <div>
            <span className="text-slate-400">Assets: </span>
            <span className="font-medium text-purple-400">{formatNumber(totals.assetsTotal)}</span>
          </div>
          <div>
            <span className="text-slate-400">Market: </span>
            <span className="font-medium text-blue-400">{formatNumber(totals.marketTotal)}</span>
          </div>
          <div>
            <span className="text-slate-400">Industry: </span>
            <span className="font-medium text-orange-400">{formatNumber(totals.industryTotal)}</span>
          </div>
          <div>
            <span className="text-slate-400">Contracts: </span>
            <span className="font-medium text-yellow-400">{formatNumber(totals.contractsTotal)}</span>
          </div>
          <div>
            <span className="text-slate-400">Wallet: </span>
            <span className="font-medium text-emerald-400">{formatNumber(totals.walletTotal)}</span>
          </div>
          <div>
            <span className="text-slate-400">Structures: </span>
            <span className="font-medium text-cyan-400">{formatNumber(totals.structuresTotal)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const showContractItems = useSettingsStore((s) => s.showContractItemsInAssets)
  const setShowContractItems = useSettingsStore((s) => s.setShowContractItemsInAssets)
  const showMarketOrders = useSettingsStore((s) => s.showMarketOrdersInAssets)
  const setShowMarketOrders = useSettingsStore((s) => s.setShowMarketOrdersInAssets)

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
          className="flex h-10 w-12 items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        {settingsOpen && (
          <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-slate-600 bg-slate-800 shadow-lg z-50">
            <div className="p-3 border-b border-slate-600">
              <span className="text-sm font-medium text-slate-200">Settings</span>
            </div>
            <div className="p-2">
              <button
                onClick={() => setShowContractItems(!showContractItems)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {showContractItems && <Check className="h-4 w-4 text-blue-400" />}
                </span>
                Show contract items in Assets
              </button>
              <button
                onClick={() => setShowMarketOrders(!showMarketOrders)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {showMarketOrders && <Check className="h-4 w-4 text-blue-400" />}
                </span>
                Show sell orders in Assets
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        onClick={() => window.electronAPI?.windowMinimize()}
        className="flex h-10 w-12 items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => window.electronAPI?.windowMaximize()}
        className="flex h-10 w-12 items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white"
      >
        {isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      </button>
      <button
        onClick={() => window.electronAPI?.windowClose()}
        className="flex h-10 w-12 items-center justify-center text-slate-400 hover:bg-red-600 hover:text-white"
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
        className="flex items-center border-b border-slate-700 bg-slate-800 px-4 py-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex flex-col" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="text-lg font-bold tracking-tight text-white">
            <span className="text-blue-400">ECT</span> EVE Assets
          </span>
          <span className="text-[10px] tracking-[0.2em] text-slate-400">
            We Like The Data
          </span>
        </div>
        <div className="mx-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ModeSwitcher mode={mode} onModeChange={setMode} />
        </div>
        <div className="mx-4">
          <RefreshStatus />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {mode === 'assets' && <HeaderControls />}
          <OwnerButton />
          <WindowControls />
        </div>
      </header>

      {/* Tab Navigation - hidden for buyback mode (has its own internal tabs) */}
      {mode !== 'buyback' && (
        <nav className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-2">
          <div className="flex gap-1">
            {mode === 'assets' ? (
              ASSET_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveAssetTab(tab)}
                  className={`px-3 py-2 text-sm transition-colors ${
                    activeAssetTab === tab
                      ? 'border-b-2 border-blue-500 text-blue-500'
                      : 'text-slate-400 hover:text-slate-50'
                  }`}
                >
                  {tab}
                </button>
              ))
            ) : (
              TOOL_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveToolTab(tab)}
                  className={`px-3 py-2 text-sm transition-colors ${
                    activeToolTab === tab
                      ? 'border-b-2 border-blue-500 text-blue-500'
                      : 'text-slate-400 hover:text-slate-50'
                  }`}
                >
                  {tab}
                </button>
              ))
            )}
          </div>
          {mode === 'assets' && (
            <div className="flex items-center gap-2 py-1">
              <ExpandCollapseButton />
              <ColumnsDropdown />
            </div>
          )}
        </nav>
      )}

      {/* Search Bar - only for assets mode */}
      {mode === 'assets' && <SearchBar />}

      {/* Content Area */}
      {mode === 'buyback' ? (
        <BuybackTab activeTab={activeBuybackTab} onTabChange={setActiveBuybackTab} />
      ) : (
        <main className="flex-1 overflow-auto p-4">
          {mode === 'assets' ? (
            <AssetTabContent tab={activeAssetTab} />
          ) : (
            <ToolTabContent tab={activeToolTab} />
          )}
        </main>
      )}
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
