import { useState } from 'react'
import { useAuthStore } from '@/store/auth-store'

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
  'Contracts',
] as const

type Tab = (typeof TABS)[number]

export function MainLayout() {
  const [activeTab, setActiveTab] = useState<Tab>('Assets')
  const { character, clearAuth } = useAuthStore()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h1 className="text-lg font-semibold text-primary">ECTEVEAssets</h1>
        <div className="flex items-center gap-4">
          {character && (
            <div className="flex items-center gap-2">
              <img
                src={`https://images.evetech.net/characters/${character.id}/portrait?size=32`}
                alt={character.name}
                className="h-8 w-8 rounded"
              />
              <span className="text-sm">{character.name}</span>
            </div>
          )}
          <button
            onClick={clearAuth}
            className="rounded px-3 py-1 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex gap-1 border-b border-border bg-card px-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{activeTab}</h2>
          <p className="mt-2 text-muted-foreground">
            Content for {activeTab} tab will be displayed here.
          </p>
        </div>
      </main>
    </div>
  )
}
