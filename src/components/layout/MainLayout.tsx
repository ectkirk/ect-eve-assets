import {
  useState,
  useCallback,
  useRef,
  useEffect,
  lazy,
  Suspense,
  type KeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Pause, Play } from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
import { useESIPauseStore } from '@/store/esi-pause-store'
import { useAssetStore } from '@/store/asset-store'
import { useExpiryCacheStore } from '@/store/expiry-cache-store'
import {
  BUYBACK_TABS,
  getStyling,
  type BuybackTabType,
} from '@/features/buyback'
import { useBuybackActionStore } from '@/store/buyback-action-store'

const AssetsTab = lazy(() =>
  import('@/features/assets').then((m) => ({ default: m.AssetsTab }))
)
const StructuresTab = lazy(() =>
  import('@/features/structures').then((m) => ({ default: m.StructuresTab }))
)
const AssetsTreeTab = lazy(() =>
  import('@/features/assets-tree').then((m) => ({ default: m.AssetsTreeTab }))
)
const MarketOrdersTab = lazy(() =>
  import('@/features/market-orders').then((m) => ({
    default: m.MarketOrdersTab,
  }))
)
const SkillsTab = lazy(() =>
  import('@/features/skills').then((m) => ({ default: m.SkillsTab }))
)
const MailTab = lazy(() =>
  import('@/features/mail').then((m) => ({ default: m.MailTab }))
)
const IndustryJobsTab = lazy(() =>
  import('@/features/industry-jobs').then((m) => ({
    default: m.IndustryJobsTab,
  }))
)
const ClonesTab = lazy(() =>
  import('@/features/clones').then((m) => ({ default: m.ClonesTab }))
)
const LoyaltyTab = lazy(() =>
  import('@/features/loyalty').then((m) => ({ default: m.LoyaltyTab }))
)
const ContractsTab = lazy(() =>
  import('@/features/contracts').then((m) => ({ default: m.ContractsTab }))
)
const WalletTab = lazy(() =>
  import('@/features/wallet').then((m) => ({ default: m.WalletTab }))
)
const BuybackTab = lazy(() =>
  import('@/features/buyback').then((m) => ({ default: m.BuybackTab }))
)
const FreightPanel = lazy(() =>
  import('@/features/tools/freight').then((m) => ({ default: m.FreightPanel }))
)
const ContractsSearchPanel = lazy(() =>
  import('@/features/tools/contracts-search').then((m) => ({
    default: m.ContractsSearchPanel,
  }))
)
const RegionalMarketPanel = lazy(() =>
  import('@/features/tools/regional-market').then((m) => ({
    default: m.RegionalMarketPanel,
  }))
)
const ReferencePanel = lazy(() =>
  import('@/features/tools/reference').then((m) => ({
    default: m.ReferencePanel,
  }))
)
const MapPanel = lazy(() =>
  import('@/features/tools/map').then((m) => ({ default: m.MapPanel }))
)
const HypernetPanel = lazy(() =>
  import('@/features/tools/hypernet').then((m) => ({
    default: m.HypernetPanel,
  }))
)
import { useFreightActionStore } from '@/store/freight-action-store'
import { useRegionalMarketActionStore } from '@/store/regional-market-action-store'
import { useContractsSearchActionStore } from '@/store/contracts-search-action-store'
import { useReferenceActionStore } from '@/store/reference-action-store'
import { useTotalAssets, useNavigationAction } from '@/hooks'
import { formatNumber } from '@/lib/utils'
import { TabControlsProvider } from '@/context'
import { FeatureErrorBoundary } from '@/components/ui/feature-error-boundary'
import { DiscordIcon } from '@/components/ui/icons'
import { UpdateBanner } from './UpdateBanner'
import { OwnerButton } from './OwnerButton'
import { WindowControls } from './WindowControls'
import { SearchBar } from './SearchBar'

type AppMode = 'assets' | 'character' | 'tools' | 'buyback' | 'freight'

const TOOLS_TAB_IDS = [
  'contracts',
  'market',
  'reference',
  'map',
  'hypernet',
] as const
const CHARACTER_TAB_IDS = ['clones', 'mail', 'skills'] as const

type ToolsTabId = (typeof TOOLS_TAB_IDS)[number]
type CharacterTabId = (typeof CHARACTER_TAB_IDS)[number]

function TabLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-content-secondary" />
    </div>
  )
}

const ASSET_TAB_IDS = [
  'assets',
  'assetsTree',
  'contracts',
  'industryJobs',
  'loyaltyPoints',
  'marketOrders',
  'structures',
  'wallet',
] as const

type AssetTabId = (typeof ASSET_TAB_IDS)[number]

function AssetTabContent({ tab }: { tab: AssetTabId }) {
  switch (tab) {
    case 'assets':
      return <AssetsTab />
    case 'assetsTree':
      return <AssetsTreeTab />
    case 'contracts':
      return <ContractsTab />
    case 'industryJobs':
      return <IndustryJobsTab />
    case 'loyaltyPoints':
      return <LoyaltyTab />
    case 'marketOrders':
      return <MarketOrdersTab />
    case 'structures':
      return <StructuresTab />
    case 'wallet':
      return <WalletTab />
  }
}

function CharacterTabContent({ tab }: { tab: CharacterTabId }) {
  switch (tab) {
    case 'clones':
      return <ClonesTab />
    case 'mail':
      return <MailTab />
    case 'skills':
      return <SkillsTab />
  }
}

const APP_MODE_IDS: AppMode[] = [
  'assets',
  'character',
  'tools',
  'buyback',
  'freight',
]

function TabButtons<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  onKeyDown,
  tabRefs,
  getLabel,
}: {
  tabs: readonly T[]
  activeTab: T
  onTabChange: (tab: T) => void
  onKeyDown: (e: KeyboardEvent, index: number) => void
  tabRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>
  getLabel: (tab: T) => string
}) {
  return tabs.map((tab, index) => (
    <button
      key={tab}
      ref={(el) => {
        tabRefs.current[index] = el
      }}
      onClick={() => onTabChange(tab)}
      onKeyDown={(e) => onKeyDown(e, index)}
      role="tab"
      aria-selected={activeTab === tab}
      aria-controls="main-content"
      tabIndex={activeTab === tab ? 0 : -1}
      className={`px-3 py-2 text-sm transition-colors ${
        activeTab === tab
          ? 'border-b-2 border-accent text-accent'
          : 'text-content-secondary hover:text-content'
      }`}
    >
      {getLabel(tab)}
    </button>
  ))
}

function ModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
}) {
  const { t } = useTranslation('layout')

  return (
    <div
      className="flex rounded-md bg-surface-tertiary/50 p-0.5"
      role="tablist"
      aria-label="Application modes"
    >
      {APP_MODE_IDS.map((id) => (
        <button
          key={id}
          onClick={() => onModeChange(id)}
          role="tab"
          aria-selected={mode === id}
          className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
            mode === id
              ? 'bg-surface-tertiary text-content'
              : 'text-content-muted hover:text-content-secondary'
          }`}
        >
          {t(`modes.${id}`)}
        </button>
      ))}
    </div>
  )
}

function RefreshStatus() {
  const { t } = useTranslation('layout')
  const currentlyRefreshing = useExpiryCacheStore((s) => s.currentlyRefreshing)
  const owners = useAuthStore((s) => s.owners)
  const isPaused = useESIPauseStore((s) => s.isPaused)

  if (!currentlyRefreshing || isPaused) return null

  const owner = owners[currentlyRefreshing.ownerKey]
  const ownerName = owner?.name ?? 'Unknown'

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-content-secondary"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{t('header.updating', { name: ownerName })}</span>
    </div>
  )
}

function ESIPausedIndicator() {
  const { t } = useTranslation('layout')
  const isPaused = useESIPauseStore((s) => s.isPaused)
  const toggle = useESIPauseStore((s) => s.toggle)
  const sync = useESIPauseStore((s) => s.sync)

  useEffect(() => {
    sync()
  }, [sync])

  if (!isPaused) return null

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-md bg-semantic-warning/20 px-3 py-1.5 text-sm font-medium text-semantic-warning transition-colors hover:bg-semantic-warning/30"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <Pause className="h-3.5 w-3.5" />
      <span>{t('header.paused')}</span>
      <Play className="h-3.5 w-3.5" />
    </button>
  )
}

function HeaderControls() {
  const { t } = useTranslation('layout')
  const totals = useTotalAssets()
  const hasData = useAssetStore((s) => s.assetsByOwner.length > 0)

  if (!hasData) return null

  return (
    <div className="flex items-center gap-4 text-sm">
      <div>
        <span className="text-content-secondary">{t('header.total')} </span>
        <span className="font-medium text-semantic-positive">
          {formatNumber(totals.total)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">{t('header.assets')} </span>
        <span className="font-medium text-accent">
          {formatNumber(totals.assetsTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">{t('header.market')} </span>
        <span className="font-medium text-status-info">
          {formatNumber(totals.marketTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">{t('header.industry')} </span>
        <span className="font-medium text-semantic-warning">
          {formatNumber(totals.industryTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">{t('header.contracts')} </span>
        <span className="font-medium text-status-corp">
          {formatNumber(totals.contractsTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">{t('header.wallet')} </span>
        <span className="font-medium text-semantic-success">
          {formatNumber(totals.walletTotal)}
        </span>
      </div>
      <div>
        <span className="text-content-secondary">
          {t('header.structures')}{' '}
        </span>
        <span className="font-medium text-status-special">
          {formatNumber(totals.structuresTotal)}
        </span>
      </div>
    </div>
  )
}

function MainLayoutInner() {
  const { t } = useTranslation('layout')
  const [mode, setMode] = useState<AppMode>('assets')
  const [activeAssetTab, setActiveAssetTab] = useState<AssetTabId>('assets')
  const [activeCharacterTab, setActiveCharacterTab] =
    useState<CharacterTabId>('clones')
  const [activeBuybackTab, setActiveBuybackTab] = useState<BuybackTabType>(
    BUYBACK_TABS[1]
  )
  const [activeToolsTab, setActiveToolsTab] = useState<ToolsTabId>('contracts')
  const [buybackPrefill, setBuybackPrefill] = useState<string | null>(null)
  const [freightPrefill, setFreightPrefill] = useState<{
    text: string
    nullSec: boolean
  } | null>(null)
  const [marketTypeId, setMarketTypeId] = useState<number | null>(null)
  const [referenceTypeId, setReferenceTypeId] = useState<number | null>(null)
  const [contractsSearchType, setContractsSearchType] = useState<{
    typeId: number
    typeName: string
  } | null>(null)

  useNavigationAction(
    useBuybackActionStore,
    useCallback((action: { securityTab: BuybackTabType; text: string }) => {
      setMode('buyback')
      setActiveBuybackTab(action.securityTab)
      setBuybackPrefill(action.text)
    }, [])
  )

  useNavigationAction(
    useFreightActionStore,
    useCallback((action: { text: string; nullSec: boolean }) => {
      setMode('freight')
      setFreightPrefill({ text: action.text, nullSec: action.nullSec })
    }, [])
  )

  useNavigationAction(
    useRegionalMarketActionStore,
    useCallback((action: { typeId: number }) => {
      setMode('tools')
      setActiveToolsTab('market')
      setMarketTypeId(action.typeId)
    }, [])
  )

  useNavigationAction(
    useContractsSearchActionStore,
    useCallback((action: { typeId: number; typeName: string }) => {
      setMode('tools')
      setActiveToolsTab('contracts')
      setContractsSearchType({
        typeId: action.typeId,
        typeName: action.typeName,
      })
    }, [])
  )

  useNavigationAction(
    useReferenceActionStore,
    useCallback((action: { typeId: number }) => {
      setMode('tools')
      setActiveToolsTab('reference')
      setReferenceTypeId(action.typeId)
    }, [])
  )

  const clearMarketTypeId = useCallback(() => setMarketTypeId(null), [])
  const clearReferenceTypeId = useCallback(() => setReferenceTypeId(null), [])
  const clearContractsSearchType = useCallback(
    () => setContractsSearchType(null),
    []
  )

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleTabKeyDown = useCallback(
    (e: KeyboardEvent, tabs: readonly string[], currentIndex: number) => {
      let newIndex: number | null = null
      if (e.key === 'ArrowRight') {
        newIndex = (currentIndex + 1) % tabs.length
      } else if (e.key === 'ArrowLeft') {
        newIndex = (currentIndex - 1 + tabs.length) % tabs.length
      } else if (e.key === 'Home') {
        newIndex = 0
      } else if (e.key === 'End') {
        newIndex = tabs.length - 1
      }
      if (newIndex !== null) {
        e.preventDefault()
        tabRefs.current[newIndex]?.focus()
      }
    },
    []
  )

  const getTabLabel = (tab: string) => t(`tabs.${tab}`)

  return (
    <div className="flex h-full flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-white"
      >
        {t('accessibility.skipToContent')}
      </a>
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
          aria-label={t('accessibility.discord')}
        >
          <DiscordIcon className="h-5 w-5" />
        </a>
        <div
          className="mx-4 flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ESIPausedIndicator />
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
      <nav
        className="flex items-center border-b border-border bg-surface-secondary px-2"
        aria-label={`${mode.charAt(0).toUpperCase() + mode.slice(1)} navigation`}
      >
        <div
          className="flex gap-1"
          role="tablist"
          aria-label={`${mode.charAt(0).toUpperCase() + mode.slice(1)} tabs`}
        >
          {mode === 'assets' && (
            <TabButtons
              tabs={ASSET_TAB_IDS}
              activeTab={activeAssetTab}
              onTabChange={setActiveAssetTab}
              onKeyDown={(e, i) => handleTabKeyDown(e, ASSET_TAB_IDS, i)}
              tabRefs={tabRefs}
              getLabel={getTabLabel}
            />
          )}
          {mode === 'character' && (
            <TabButtons
              tabs={CHARACTER_TAB_IDS}
              activeTab={activeCharacterTab}
              onTabChange={setActiveCharacterTab}
              onKeyDown={(e, i) => handleTabKeyDown(e, CHARACTER_TAB_IDS, i)}
              tabRefs={tabRefs}
              getLabel={getTabLabel}
            />
          )}
          {mode === 'buyback' &&
            BUYBACK_TABS.map((tab, index) => {
              const styling = getStyling(tab)
              return (
                <button
                  key={tab}
                  ref={(el) => {
                    tabRefs.current[index] = el
                  }}
                  onClick={() => setActiveBuybackTab(tab)}
                  onKeyDown={(e) => handleTabKeyDown(e, BUYBACK_TABS, index)}
                  role="tab"
                  aria-selected={activeBuybackTab === tab}
                  aria-controls="main-content"
                  tabIndex={activeBuybackTab === tab ? 0 : -1}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    activeBuybackTab === tab
                      ? 'border-b-2 border-accent text-accent'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${styling.color}`}
                    aria-hidden="true"
                  />
                  {t(`tools:buyback.tabs.${tab}`)}
                </button>
              )
            })}
          {mode === 'tools' && (
            <TabButtons
              tabs={TOOLS_TAB_IDS}
              activeTab={activeToolsTab}
              onTabChange={setActiveToolsTab}
              onKeyDown={(e, i) => handleTabKeyDown(e, TOOLS_TAB_IDS, i)}
              tabRefs={tabRefs}
              getLabel={getTabLabel}
            />
          )}
        </div>
        <div className="flex-1" />
        <OwnerButton />
      </nav>

      {/* Search Bar - for assets and character modes */}
      {(mode === 'assets' || mode === 'character') && <SearchBar />}

      {/* Content Area */}
      <main
        id="main-content"
        className="flex-1 overflow-hidden"
        role="tabpanel"
      >
        <Suspense fallback={<TabLoadingFallback />}>
          {mode === 'assets' && (
            <FeatureErrorBoundary key={activeAssetTab} feature={activeAssetTab}>
              <div className="h-full overflow-auto p-4">
                <AssetTabContent tab={activeAssetTab} />
              </div>
            </FeatureErrorBoundary>
          )}
          {mode === 'character' && (
            <FeatureErrorBoundary
              key={activeCharacterTab}
              feature={activeCharacterTab}
            >
              <div className="h-full overflow-auto p-4">
                <CharacterTabContent tab={activeCharacterTab} />
              </div>
            </FeatureErrorBoundary>
          )}
          {mode === 'buyback' && (
            <FeatureErrorBoundary key="buyback" feature="Buyback">
              <div className="h-full overflow-auto p-4">
                <BuybackTab
                  activeTab={activeBuybackTab}
                  prefillText={buybackPrefill}
                  onPrefillConsumed={() => setBuybackPrefill(null)}
                />
              </div>
            </FeatureErrorBoundary>
          )}
          {mode === 'tools' && activeToolsTab === 'contracts' && (
            <FeatureErrorBoundary key="contracts" feature="Contracts Search">
              <ContractsSearchPanel
                initialType={contractsSearchType}
                onInitialTypeConsumed={clearContractsSearchType}
              />
            </FeatureErrorBoundary>
          )}
          {mode === 'tools' && activeToolsTab === 'market' && (
            <FeatureErrorBoundary key="market" feature="Regional Market">
              <RegionalMarketPanel
                initialTypeId={marketTypeId}
                onInitialTypeConsumed={clearMarketTypeId}
              />
            </FeatureErrorBoundary>
          )}
          {mode === 'freight' && (
            <FeatureErrorBoundary key="freight" feature="Freight">
              <FreightPanel
                prefillText={freightPrefill?.text}
                prefillNullSec={freightPrefill?.nullSec}
                onPrefillConsumed={() => setFreightPrefill(null)}
              />
            </FeatureErrorBoundary>
          )}
          {mode === 'tools' && activeToolsTab === 'map' && (
            <FeatureErrorBoundary key="map" feature="Map">
              <MapPanel />
            </FeatureErrorBoundary>
          )}
          {mode === 'tools' && activeToolsTab === 'reference' && (
            <FeatureErrorBoundary key="reference" feature="Reference">
              <ReferencePanel
                initialTypeId={referenceTypeId}
                onClearInitialTypeId={clearReferenceTypeId}
              />
            </FeatureErrorBoundary>
          )}
          {mode === 'tools' && activeToolsTab === 'hypernet' && (
            <FeatureErrorBoundary key="hypernet" feature="Hypernet">
              <HypernetPanel />
            </FeatureErrorBoundary>
          )}
        </Suspense>
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
