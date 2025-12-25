import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
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
import {
  BuybackTab,
  BUYBACK_TABS,
  getStyling,
  tabToKey,
  type BuybackTabType,
} from '@/features/buyback'
import { ToolsTab, TOOLS_TABS, type ToolsTabType } from '@/features/tools'
import { useBuybackActionStore } from '@/store/buyback-action-store'
import { useTotalAssets } from '@/hooks'
import { formatNumber } from '@/lib/utils'
import { TabControlsProvider } from '@/context'
import { UpdateBanner } from './UpdateBanner'
import { ToastContainer } from './ToastContainer'
import { OwnerButton } from './OwnerButton'
import { WindowControls } from './WindowControls'
import { SearchBar } from './SearchBar'

type AppMode = 'assets' | 'buyback' | 'tools'

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

type AssetTab = (typeof ASSET_TABS)[number]

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

function ModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
}) {
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

function HeaderControls() {
  const totals = useTotalAssets()
  const hasData = useAssetStore((s) => s.assetsByOwner.length > 0)

  if (!hasData) return null

  return (
    <div className="flex items-center gap-4 text-sm">
      <div>
        <span className="text-content-secondary">Total: </span>
        <span className="font-medium text-semantic-positive">
          {formatNumber(totals.total)} ISK
        </span>
      </div>
      <div>
        <span className="text-content-secondary">Assets: </span>
        <span className="font-medium text-accent">
          {formatNumber(totals.assetsTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">Market: </span>
        <span className="font-medium text-status-info">
          {formatNumber(totals.marketTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">Industry: </span>
        <span className="font-medium text-semantic-warning">
          {formatNumber(totals.industryTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">Contracts: </span>
        <span className="font-medium text-status-corp">
          {formatNumber(totals.contractsTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">Wallet: </span>
        <span className="font-medium text-semantic-success">
          {formatNumber(totals.walletTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">Structures: </span>
        <span className="font-medium text-status-special">
          {formatNumber(totals.structuresTotal)}
        </span>
      </div>
    </div>
  )
}

function MainLayoutInner() {
  const [mode, setMode] = useState<AppMode>('assets')
  const [activeAssetTab, setActiveAssetTab] = useState<AssetTab>('Assets')
  const [activeBuybackTab, setActiveBuybackTab] = useState<BuybackTabType>(
    BUYBACK_TABS[1]
  )
  const [activeToolsTab, setActiveToolsTab] = useState<ToolsTabType>(
    TOOLS_TABS[0]
  )
  const [buybackPrefill, setBuybackPrefill] = useState<string | null>(null)

  useEffect(() => {
    return useBuybackActionStore.subscribe((state, prevState) => {
      if (state.pendingAction && !prevState.pendingAction) {
        setMode('buyback')
        setActiveBuybackTab(state.pendingAction.securityTab)
        setBuybackPrefill(state.pendingAction.text)
        queueMicrotask(() => {
          useBuybackActionStore.getState().clearAction()
        })
      }
    })
  }, [])

  return (
    <div className="flex h-full flex-col">
      <ToastContainer />
      <UpdateBanner />
      {/* Header */}
      <header
        className="flex items-center border-b border-border bg-surface-secondary px-4 py-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex flex-col"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-lg font-bold tracking-tight text-content">
            <span className="text-accent">ECT</span> EVE Assets
          </span>
        </div>
        <div
          className="mx-4"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
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
          <svg
            className="h-5 w-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </a>
        <div className="mx-4">
          <RefreshStatus />
        </div>
        <div className="flex-1" />
        <div
          className="flex items-center gap-4"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <HeaderControls />
          <WindowControls />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex items-center border-b border-border bg-surface-secondary px-2">
        <div className="flex gap-1">
          {mode === 'assets' &&
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
            ))}
          {mode === 'buyback' &&
            BUYBACK_TABS.map((tab) => {
              const styling = getStyling(tabToKey(tab))
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
                  <span className={`h-2 w-2 rounded-full ${styling.color}`} />
                  {tab}
                </button>
              )
            })}
          {mode === 'tools' &&
            TOOLS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveToolsTab(tab)}
                className={`px-3 py-2 text-sm transition-colors ${
                  activeToolsTab === tab
                    ? 'border-b-2 border-accent text-accent'
                    : 'text-content-secondary hover:text-content'
                }`}
              >
                {tab}
              </button>
            ))}
        </div>
        <div className="flex-1" />
        <OwnerButton />
      </nav>

      {/* Search Bar - only for assets mode */}
      {mode === 'assets' && <SearchBar />}

      {/* Content Area */}
      <main className="flex-1 overflow-hidden">
        {mode === 'assets' && (
          <div className="h-full overflow-auto p-4">
            <AssetTabContent tab={activeAssetTab} />
          </div>
        )}
        {mode === 'buyback' && (
          <div className="h-full overflow-auto p-4">
            <BuybackTab
              activeTab={activeBuybackTab}
              prefillText={buybackPrefill}
              onPrefillConsumed={() => setBuybackPrefill(null)}
            />
          </div>
        )}
        {mode === 'tools' && <ToolsTab activeTab={activeToolsTab} />}
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
