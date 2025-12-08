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
      <header className="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-2">
        <div className="flex flex-col">
          <span className="text-lg font-bold text-white tracking-tight">
            <span className="text-blue-400">ECT</span> EVE Assets
          </span>
          <span className="text-[10px] tracking-[0.2em] text-slate-400">We Like The Data</span>
        </div>
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
            className="rounded px-3 py-1 text-sm text-slate-400 hover:bg-slate-700 hover:text-slate-50"
          >
            Logout
          </button>
        </div>
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
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-4">
          <h2 className="text-lg font-semibold">{activeTab}</h2>
          <p className="mt-2 text-slate-400">
            Content for {activeTab} tab will be displayed here.
          </p>
        </div>
      </main>
    </div>
  )
}
