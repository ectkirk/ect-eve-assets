import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useAssetStore } from '@/store/asset-store'
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
import { Plus, Loader2, RefreshCw, ChevronDown, Check, ChevronsUpDown, ChevronsDownUp, Search, X, User } from 'lucide-react'
import { OwnerIcon } from '@/components/ui/type-icon'
import { OwnerManagementModal } from './OwnerManagementModal'
import { useTotalAssets } from '@/hooks'
import { formatNumber } from '@/lib/utils'
import { TabControlsProvider, useTabControls } from '@/context'

const TABS = [
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

type Tab = (typeof TABS)[number]

function TabContent({ tab }: { tab: Tab }) {
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
    default:
      return (
        <div className="text-slate-400">
          Content for {tab} tab will be displayed here.
        </div>
      )
  }
}

function OwnerButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const [isAddingOwner, setIsAddingOwner] = useState(false)

  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])
  const activeOwnerId = useAuthStore((state) => state.activeOwnerId)

  const activeOwner = useMemo(
    () => owners.find((o) => ownerKey(o.type, o.id) === activeOwnerId),
    [owners, activeOwnerId]
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
        const newOwner = {
          id: result.characterId,
          type: 'character' as const,
          name: result.characterName,
          characterId: result.characterId,
          corporationId: result.corporationId,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
        }
        useAuthStore.getState().addOwner({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt ?? Date.now() + 1200000,
          owner: {
            id: result.characterId,
            type: 'character',
            name: result.characterName,
            characterId: result.characterId,
            corporationId: result.corporationId,
          },
        })
        setModalOpen(true)
        useAssetStore.getState().updateForOwner(newOwner)
      }
    } finally {
      setIsAddingOwner(false)
    }
  }

  if (owners.length === 0) {
    return (
      <button
        onClick={handleAddFirstCharacter}
        disabled={isAddingOwner}
        className="flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500 disabled:opacity-50"
      >
        {isAddingOwner ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Logging in...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Add Character
          </>
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

function formatTimeRemaining(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
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
          className="w-full rounded border border-slate-600 bg-slate-700 pl-9 pr-8 py-1.5 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none"
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
          className="w-40 rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Categories</option>
          {categoryFilter.categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      )}

      {totalValue !== null && (
        <span className="text-sm">
          <span className="text-slate-400">Value: </span>
          <span className="text-green-400">{formatNumber(totalValue)} ISK</span>
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
  const isUpdating = useAssetStore((s) => s.isUpdating)
  const update = useAssetStore((s) => s.update)
  const canUpdateFn = useAssetStore((s) => s.canUpdate)
  const getTimeUntilUpdateFn = useAssetStore((s) => s.getTimeUntilUpdate)
  const hasData = useAssetStore((s) => s.assetsByOwner.length > 0)

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const canUpdate = canUpdateFn()
  const timeUntilUpdate = getTimeUntilUpdateFn()

  return (
    <div className="flex items-center gap-4">
      {hasData && (
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-slate-400">Total Assets: </span>
            <span className="font-medium text-green-400">{formatNumber(totals.total)} ISK</span>
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
        </div>
      )}
      <button
        onClick={() => update()}
        disabled={!canUpdate}
        title={canUpdate ? 'Update assets from ESI' : `Available in ${formatTimeRemaining(timeUntilUpdate)}`}
        className="flex items-center gap-1.5 rounded border border-slate-600 bg-slate-700 px-2.5 py-1 text-sm hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
        {canUpdate ? 'Update' : formatTimeRemaining(timeUntilUpdate)}
      </button>
    </div>
  )
}

function MainLayoutInner() {
  const [activeTab, setActiveTab] = useState<Tab>('Assets')

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight text-white">
            <span className="text-blue-400">ECT</span> EVE Assets
          </span>
          <span className="text-[10px] tracking-[0.2em] text-slate-400">
            We Like The Data
          </span>
        </div>
        <div className="flex items-center gap-4">
          <HeaderControls />
          <OwnerButton />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-2">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-500 text-blue-500'
                  : 'text-slate-400 hover:text-slate-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 py-1">
          <ExpandCollapseButton />
          <ColumnsDropdown />
        </div>
      </nav>

      {/* Search Bar */}
      <SearchBar />

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-4">
        <TabContent tab={activeTab} />
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
