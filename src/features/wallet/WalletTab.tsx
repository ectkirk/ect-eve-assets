import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, ChevronRight, ChevronDown, Wallet, Building2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth-store'
import { useWalletStore, isCorporationWallet } from '@/store/wallet-store'
import { useAssetData } from '@/hooks/useAssetData'
import { OwnerIcon } from '@/components/ui/type-icon'
import { cn } from '@/lib/utils'
import { useTabControls } from '@/context'

function formatISK(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000_000) {
    return sign + (abs / 1_000_000_000_000).toFixed(2) + 'T ISK'
  }
  if (abs >= 1_000_000_000) {
    return sign + (abs / 1_000_000_000).toFixed(2) + 'B ISK'
  }
  if (abs >= 1_000_000) {
    return sign + (abs / 1_000_000).toFixed(2) + 'M ISK'
  }
  return value.toLocaleString() + ' ISK'
}

const DIVISION_NAMES = [
  'Master Wallet',
  '2nd Wallet Division',
  '3rd Wallet Division',
  '4th Wallet Division',
  '5th Wallet Division',
  '6th Wallet Division',
  '7th Wallet Division',
]

export function WalletTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const walletsByOwner = useWalletStore((s) => s.walletsByOwner)
  const walletLastUpdated = useWalletStore((s) => s.lastUpdated)
  const walletUpdating = useWalletStore((s) => s.isUpdating)
  const updateError = useWalletStore((s) => s.updateError)
  const init = useWalletStore((s) => s.init)
  const initialized = useWalletStore((s) => s.initialized)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || walletUpdating

  useEffect(() => {
    init()
  }, [init])

  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set())

  const toggleOwner = useCallback((ownerKey: string) => {
    setExpandedOwners((prev) => {
      const next = new Set(prev)
      if (next.has(ownerKey)) next.delete(ownerKey)
      else next.add(ownerKey)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    const allKeys = walletsByOwner
      .filter((w) => isCorporationWallet(w))
      .map((w) => `${w.owner.type}-${w.owner.id}`)
    setExpandedOwners(new Set(allKeys))
  }, [walletsByOwner])

  const collapseAll = useCallback(() => {
    setExpandedOwners(new Set())
  }, [])

  const { setExpandCollapse } = useTabControls()

  const expandableKeys = useMemo(
    () => walletsByOwner.filter((w) => isCorporationWallet(w)).map((w) => `${w.owner.type}-${w.owner.id}`),
    [walletsByOwner]
  )

  const isAllExpanded = expandableKeys.length > 0 && expandableKeys.every((k) => expandedOwners.has(k))

  useEffect(() => {
    if (expandableKeys.length === 0) {
      setExpandCollapse(null)
      return
    }

    setExpandCollapse({
      isExpanded: isAllExpanded,
      toggle: () => {
        if (isAllExpanded) {
          collapseAll()
        } else {
          expandAll()
        }
      },
    })

    return () => setExpandCollapse(null)
  }, [expandableKeys, isAllExpanded, expandAll, collapseAll, setExpandCollapse])

  const totalBalance = useMemo(() => {
    let total = 0
    for (const wallet of walletsByOwner) {
      if (isCorporationWallet(wallet)) {
        for (const div of wallet.divisions) {
          total += div.balance
        }
      } else {
        total += wallet.balance
      }
    }
    return total
  }, [walletsByOwner])

  const sortedWallets = useMemo(() => {
    return [...walletsByOwner].sort((a, b) => {
      if (a.owner.type !== b.owner.type) {
        return a.owner.type === 'character' ? -1 : 1
      }
      return a.owner.name.localeCompare(b.owner.name)
    })
  }, [walletsByOwner])

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No characters logged in. Add a character to view wallets.</p>
      </div>
    )
  }

  if (!initialized || (isUpdating && walletsByOwner.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">Loading wallets...</p>
        </div>
      </div>
    )
  }

  if (walletsByOwner.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {updateError && (
            <>
              <p className="text-red-500">Failed to load wallets</p>
              <p className="text-sm text-slate-400 mb-4">{updateError}</p>
            </>
          )}
          {!updateError && (
            <p className="text-slate-400">No wallet data loaded. Use the Update button in the header to fetch from ESI.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-slate-400">Total Balance: </span>
          <span className="font-medium text-green-400">{formatISK(totalBalance)}</span>
        </div>
      </div>

      <div
        className="rounded-lg border border-slate-700 overflow-auto"
        style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}
      >
        {sortedWallets.map((wallet) => {
          const ownerKey = `${wallet.owner.type}-${wallet.owner.id}`
          const isCorp = isCorporationWallet(wallet)
          const isExpanded = expandedOwners.has(ownerKey)

          let ownerTotal = 0
          if (isCorp) {
            for (const div of wallet.divisions) {
              ownerTotal += div.balance
            }
          } else {
            ownerTotal = wallet.balance
          }

          return (
            <div key={ownerKey} className="border-b border-slate-700 last:border-b-0">
              <button
                onClick={() => isCorp && toggleOwner(ownerKey)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left',
                  isCorp ? 'hover:bg-slate-800/50 cursor-pointer' : 'cursor-default'
                )}
              >
                {isCorp ? (
                  isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )
                ) : (
                  <Wallet className="h-4 w-4 text-slate-400" />
                )}
                <OwnerIcon
                  ownerId={wallet.owner.id}
                  ownerType={wallet.owner.type}
                  size="lg"
                />
                <span className="font-medium flex-1">{wallet.owner.name}</span>
                <span
                  className={cn(
                    'font-medium tabular-nums',
                    ownerTotal >= 0 ? 'text-green-400' : 'text-red-400'
                  )}
                >
                  {formatISK(ownerTotal)}
                </span>
              </button>

              {isCorp && isExpanded && (
                <div className="px-4 pb-3">
                  {wallet.divisions
                    .sort((a, b) => a.division - b.division)
                    .map((div) => (
                      <div
                        key={div.division}
                        className="flex items-center gap-3 py-2 pl-8 border-t border-slate-700/50 first:border-t-0"
                      >
                        <Building2 className="h-4 w-4 text-slate-500" />
                        <span className="text-slate-300 flex-1">
                          {DIVISION_NAMES[div.division - 1] ?? `Division ${div.division}`}
                        </span>
                        <span
                          className={cn(
                            'font-medium tabular-nums text-sm',
                            div.balance >= 0 ? 'text-green-400' : 'text-red-400'
                          )}
                        >
                          {formatISK(div.balance)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {walletLastUpdated && (
        <p className="text-xs text-slate-500 text-right">
          Last updated: {new Date(walletLastUpdated).toLocaleString()}
        </p>
      )}
    </div>
  )
}
