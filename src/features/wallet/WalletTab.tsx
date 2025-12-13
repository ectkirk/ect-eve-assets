import { useEffect, useMemo } from 'react'
import { ChevronRight, ChevronDown, Wallet, Building2 } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useWalletStore, isCorporationWallet } from '@/store/wallet-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { useAssetData } from '@/hooks/useAssetData'
import { OwnerIcon } from '@/components/ui/type-icon'
import { cn, formatISK } from '@/lib/utils'
import { useTabControls } from '@/context'
import { useColumnSettings, useExpandCollapse, type ColumnConfig } from '@/hooks'
import { TabLoadingState } from '@/components/ui/tab-loading-state'

const DEFAULT_WALLET_NAMES = [
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

  const walletsByOwner = useWalletStore((s) => s.dataByOwner)
  const walletUpdating = useWalletStore((s) => s.isUpdating)
  const updateError = useWalletStore((s) => s.updateError)
  const init = useWalletStore((s) => s.init)
  const initialized = useWalletStore((s) => s.initialized)

  const divisionsInit = useDivisionsStore((s) => s.init)
  const divisionsInitialized = useDivisionsStore((s) => s.initialized)
  const getWalletName = useDivisionsStore((s) => s.getWalletName)
  const fetchDivisionsForOwner = useDivisionsStore((s) => s.fetchForOwner)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || walletUpdating

  useEffect(() => {
    init()
    divisionsInit()
  }, [init, divisionsInit])

  useEffect(() => {
    if (!divisionsInitialized) return
    for (const owner of owners) {
      if (owner.type === 'corporation') {
        fetchDivisionsForOwner(owner)
      }
    }
  }, [divisionsInitialized, owners, fetchDivisionsForOwner])

  const { setExpandCollapse, search, setResultCount, setTotalValue, setColumns } = useTabControls()

  const WALLET_COLUMNS: ColumnConfig[] = useMemo(() => [
    { id: 'owner', label: 'Owner' },
    { id: 'balance', label: 'Balance' },
  ], [])

  const { getColumnsForDropdown } = useColumnSettings('wallet', WALLET_COLUMNS)

  const expandableKeys = useMemo(
    () => walletsByOwner.filter((w) => isCorporationWallet(w)).map((w) => `${w.owner.type}-${w.owner.id}`),
    [walletsByOwner]
  )

  const { isExpanded, toggle } = useExpandCollapse(expandableKeys, setExpandCollapse)

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

  const activeOwnerId = useAuthStore((s) => s.activeOwnerId)

  const sortedWallets = useMemo(() => {
    let filtered = walletsByOwner
    if (activeOwnerId !== null) {
      filtered = walletsByOwner.filter((w) => ownerKey(w.owner.type, w.owner.id) === activeOwnerId)
    }

    const sorted = [...filtered].sort((a, b) => {
      const aBalance = 'divisions' in a
        ? a.divisions.reduce((sum, d) => sum + d.balance, 0)
        : a.balance
      const bBalance = 'divisions' in b
        ? b.divisions.reduce((sum, d) => sum + d.balance, 0)
        : b.balance
      return bBalance - aBalance
    })

    if (!search) return sorted

    const searchLower = search.toLowerCase()
    return sorted.filter((wallet) => wallet.owner.name.toLowerCase().includes(searchLower))
  }, [walletsByOwner, search, activeOwnerId])

  useEffect(() => {
    setResultCount({ showing: sortedWallets.length, total: walletsByOwner.length })
    return () => setResultCount(null)
  }, [sortedWallets.length, walletsByOwner.length, setResultCount])

  useEffect(() => {
    setTotalValue({ value: totalBalance })
    return () => setTotalValue(null)
  }, [totalBalance, setTotalValue])

  useEffect(() => {
    setColumns(getColumnsForDropdown())
    return () => setColumns([])
  }, [getColumnsForDropdown, setColumns])

  const loadingState = TabLoadingState({
    dataType: 'wallets',
    initialized,
    isUpdating,
    hasData: walletsByOwner.length > 0,
    hasOwners: owners.length > 0,
    updateError,
  })
  if (loadingState) return loadingState

  return (
    <div className="h-full rounded-lg border border-slate-700 overflow-auto">
      {sortedWallets.map((wallet) => {
        const key = `${wallet.owner.type}-${wallet.owner.id}`
        const isCorp = isCorporationWallet(wallet)
        const expanded = isExpanded(key)

        let ownerTotal = 0
        if (isCorp) {
          for (const div of wallet.divisions) {
            ownerTotal += div.balance
          }
        } else {
          ownerTotal = wallet.balance
        }

        return (
          <div key={key} className="border-b border-slate-700 last:border-b-0">
            <button
              onClick={() => isCorp && toggle(key)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left',
                isCorp && 'hover:bg-slate-800/50'
              )}
            >
              {isCorp ? (
                expanded ? (
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

            {isCorp && expanded && (
              <div className="px-4 pb-3">
                {wallet.divisions
                  .sort((a, b) => a.division - b.division)
                  .map((div) => {
                    const customName = getWalletName(wallet.owner.id, div.division)
                    const defaultName = DEFAULT_WALLET_NAMES[div.division - 1] ?? `Division ${div.division}`
                    const displayName = customName || defaultName

                    return (
                      <div
                        key={div.division}
                        className="flex items-center gap-3 py-2 pl-8 border-t border-slate-700/50 first:border-t-0"
                      >
                        <Building2 className="h-4 w-4 text-slate-500" />
                        <span className="text-slate-300 flex-1">
                          {displayName}
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
                    )
                  })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
