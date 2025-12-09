import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Check } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useDataCacheStore, type DataType } from '@/store/data-cache-store'
import { useAuthStore } from '@/store/auth-store'

interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (selected: DataType[]) => Promise<void>
}

interface DataTypeConfig {
  key: DataType
  label: string
  description: string
}

const DATA_TYPES: DataTypeConfig[] = [
  { key: 'assets', label: 'Assets', description: 'Character and corporation assets' },
  { key: 'marketOrders', label: 'Market Orders', description: 'Buy and sell orders' },
  { key: 'industryJobs', label: 'Industry Jobs', description: 'Manufacturing and reactions' },
  { key: 'contracts', label: 'Contracts', description: 'Contract items' },
  { key: 'clones', label: 'Clones', description: 'Jump clones and implants' },
  { key: 'prices', label: 'Price Data', description: 'Regional market prices' },
]

function formatTimeRemaining(ms: number | null): string {
  if (ms === null) return 'Not cached'
  if (ms <= 0) return 'Now'

  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function isEntryUpdatable(entry: { isFetching: boolean; expiresAt: Date | null }): boolean {
  if (entry.isFetching) return false
  if (!entry.expiresAt) return true
  return new Date() >= entry.expiresAt
}

function getEntryTimeUntilUpdate(entry: { expiresAt: Date | null }): number | null {
  if (!entry.expiresAt) return null
  const remaining = entry.expiresAt.getTime() - Date.now()
  return remaining > 0 ? remaining : 0
}

export function UpdateDialog({ open, onOpenChange, onUpdate }: UpdateDialogProps) {
  const owners = useAuthStore(useShallow((state) => Object.values(state.owners)))
  const cache = useDataCacheStore(useShallow((state) => state.cache))

  const [selected, setSelected] = useState<Set<DataType>>(new Set())
  const [isUpdating, setIsUpdating] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [open])

  const initialUpdatable = useMemo(() => {
    const updatable = new Set<DataType>()
    for (const dt of DATA_TYPES) {
      if (isEntryUpdatable(cache[dt.key])) {
        updatable.add(dt.key)
      }
    }
    return updatable
  }, [cache])

  useEffect(() => {
    if (open) {
      setSelected(initialUpdatable)
    }
  }, [open, initialUpdatable])

  const toggleSelection = useCallback((dataType: DataType) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(dataType)) {
        next.delete(dataType)
      } else {
        next.add(dataType)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    const all = new Set<DataType>()
    for (const dt of DATA_TYPES) {
      if (isEntryUpdatable(cache[dt.key])) {
        all.add(dt.key)
      }
    }
    setSelected(all)
  }, [cache])

  const selectNone = useCallback(() => {
    setSelected(new Set())
  }, [])

  const handleUpdate = useCallback(async () => {
    if (selected.size === 0) return
    setIsUpdating(true)
    try {
      await onUpdate(Array.from(selected))
      onOpenChange(false)
    } finally {
      setIsUpdating(false)
    }
  }, [selected, onUpdate, onOpenChange])

  const hasOwners = owners.length > 0
  const canUpdate = selected.size > 0 && !isUpdating && hasOwners

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Data</DialogTitle>
        </DialogHeader>

        {!hasOwners ? (
          <p className="text-slate-400 text-sm py-4">
            No characters logged in. Add a character first.
          </p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700">
              <span className="text-sm text-slate-400">Select data to update</span>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={selectAll}
                  className="text-blue-400 hover:text-blue-300"
                >
                  All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={selectNone}
                  className="text-blue-400 hover:text-blue-300"
                >
                  None
                </button>
              </div>
            </div>

            {DATA_TYPES.map((dt) => {
              const entry = cache[dt.key]
              const updatable = isEntryUpdatable(entry)
              const timeRemaining = getEntryTimeUntilUpdate(entry)
              const isFetching = entry.isFetching
              const isSelected = selected.has(dt.key)

              return (
                <label
                  key={dt.key}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                    updatable
                      ? 'hover:bg-slate-800'
                      : 'opacity-50 cursor-not-allowed'
                  } ${isSelected && updatable ? 'bg-slate-800' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        isSelected && updatable
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-slate-600'
                      }`}
                    >
                      {isSelected && updatable && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isSelected}
                      disabled={!updatable || isFetching}
                      onChange={() => toggleSelection(dt.key)}
                    />
                    <div>
                      <div className="text-sm font-medium">{dt.label}</div>
                      <div className="text-xs text-slate-500">{dt.description}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    {isFetching ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    ) : (
                      <span
                        className={`text-xs ${
                          updatable ? 'text-green-400' : 'text-slate-500'
                        }`}
                      >
                        {formatTimeRemaining(timeRemaining)}
                      </span>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm rounded border border-slate-600 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={!canUpdate}
            className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
            Update
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
