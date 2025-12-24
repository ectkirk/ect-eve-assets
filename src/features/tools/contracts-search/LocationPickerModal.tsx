import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { getAllRegions } from '@/store/cache'

interface LocationPickerModalProps {
  onSelect: (location: {
    type: 'region' | 'system'
    id: number
    name: string
  }) => void
  onClose: () => void
}

export function LocationPickerModal({
  onSelect,
  onClose,
}: LocationPickerModalProps) {
  const [searchText, setSearchText] = useState('')
  const [activeTab, setActiveTab] = useState<'region' | 'system'>('region')

  const regions = useMemo(
    () => getAllRegions().sort((a, b) => a.name.localeCompare(b.name)),
    []
  )

  const filteredRegions = useMemo(() => {
    if (!searchText) return regions
    const search = searchText.toLowerCase()
    return regions.filter((r) => r.name.toLowerCase().includes(search))
  }, [regions, searchText])

  const handleSelect = (id: number, name: string) => {
    onSelect({ type: activeTab, id, name })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-medium text-content">Pick A Location</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-content-muted hover:bg-surface-tertiary hover:text-content"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('region')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'region'
                ? 'border-b-2 border-accent text-accent'
                : 'text-content-secondary hover:text-content'
            }`}
          >
            Region
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'system'
                ? 'border-b-2 border-accent text-accent'
                : 'text-content-secondary hover:text-content'
            }`}
          >
            System
          </button>
        </div>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder={`Search ${activeTab}s...`}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full rounded border border-border bg-surface-tertiary py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-hidden"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'region' ? (
            <div className="divide-y divide-border">
              {filteredRegions.map((region) => (
                <button
                  key={region.id}
                  onClick={() => handleSelect(region.id, region.name)}
                  className="w-full px-4 py-2 text-left text-sm text-content hover:bg-surface-tertiary"
                >
                  {region.name}
                </button>
              ))}
              {filteredRegions.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-content-muted">
                  No regions found
                </div>
              )}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-content-muted">
              System search requires API integration.
              <br />
              Use Region selection for now.
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <button
            onClick={onClose}
            className="w-full rounded border border-border bg-surface-tertiary px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-surface-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
