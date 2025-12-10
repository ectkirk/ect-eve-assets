import { useState, useMemo } from 'react'
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
import { Plus, Loader2 } from 'lucide-react'
import { OwnerIcon } from '@/components/ui/type-icon'
import { OwnerManagementModal } from './OwnerManagementModal'

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
        {activeOwner && (
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
        )}
      </button>
      <OwnerManagementModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}

export function MainLayout() {
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
        <OwnerButton />
      </header>

      {/* Tab Navigation */}
      <nav className="flex gap-1 border-b border-slate-700 bg-slate-800 px-2">
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
      </nav>

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-4">
        <TabContent tab={activeTab} />
      </main>
    </div>
  )
}
