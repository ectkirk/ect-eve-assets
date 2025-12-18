import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Wallet, Building2, ScrollText, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useWalletStore, isCorporationWallet } from '@/store/wallet-store'
import {
  useWalletJournalStore,
  CORPORATION_WALLET_DIVISIONS,
  DEFAULT_WALLET_NAMES,
} from '@/store/wallet-journal-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { useAssetData } from '@/hooks/useAssetData'
import { OwnerIcon } from '@/components/ui/type-icon'
import { cn, formatISK } from '@/lib/utils'
import { useTabControls } from '@/context'
import { useColumnSettings, useExpandCollapse, type ColumnConfig } from '@/hooks'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { JournalTable, type JournalEntryWithOwner } from './JournalTable'

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

  const journalByOwner = useWalletJournalStore((s) => s.journalByOwner)
  const journalInit = useWalletJournalStore((s) => s.init)
  const journalUpdate = useWalletJournalStore((s) => s.update)
  const journalInitialized = useWalletJournalStore((s) => s.initialized)

  const [showJournal, setShowJournal] = useState(false)
  const [refTypeFilter, setRefTypeFilter] = useState<string>('')
  const [divisionFilter, setDivisionFilter] = useState<number | null>(null)

  const { isLoading: assetsUpdating } = useAssetData()
  const isUpdating = assetsUpdating || walletUpdating

  useEffect(() => {
    init()
    divisionsInit()
    journalInit()
  }, [init, divisionsInit, journalInit])

  useEffect(() => {
    if (journalInitialized && showJournal) {
      journalUpdate()
    }
  }, [journalInitialized, showJournal, journalUpdate])

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

  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const { characterWallets, corporationWallets } = useMemo(() => {
    let filtered = walletsByOwner.filter((w) => selectedSet.has(ownerKey(w.owner.type, w.owner.id)))

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((wallet) => wallet.owner.name.toLowerCase().includes(searchLower))
    }

    const sortByBalance = (a: typeof filtered[0], b: typeof filtered[0]) => {
      const aBalance = 'divisions' in a
        ? a.divisions.reduce((sum, d) => sum + d.balance, 0)
        : a.balance
      const bBalance = 'divisions' in b
        ? b.divisions.reduce((sum, d) => sum + d.balance, 0)
        : b.balance
      return bBalance - aBalance
    }

    const characters = filtered.filter((w) => w.owner.type === 'character').sort(sortByBalance)
    const corporations = filtered.filter((w) => w.owner.type === 'corporation').sort(sortByBalance)

    return { characterWallets: characters, corporationWallets: corporations }
  }, [walletsByOwner, search, selectedSet])

  const sortedWallets = useMemo(
    () => [...characterWallets, ...corporationWallets],
    [characterWallets, corporationWallets]
  )

  const { filteredJournalEntries, availableRefTypes, selectedOwnerJournal, hasCorporationEntries, journalTotals } = useMemo(() => {
    const journals = journalByOwner.filter((j) => selectedSet.has(ownerKey(j.owner.type, j.owner.id)))

    const allEntries: JournalEntryWithOwner[] = journals
      .flatMap((j) => j.entries.map((e) => ({ ...e, owner: j.owner })))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const refTypes = [...new Set(allEntries.map((e) => e.ref_type))].sort()
    const hasCorpEntries = allEntries.some((e) => e.division !== undefined)

    let filtered = allEntries
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (e) =>
          e.description.toLowerCase().includes(searchLower) ||
          e.ref_type.toLowerCase().includes(searchLower)
      )
    }
    if (refTypeFilter) {
      filtered = filtered.filter((e) => e.ref_type === refTypeFilter)
    }
    if (divisionFilter !== null) {
      filtered = filtered.filter((e) => e.division === divisionFilter)
    }

    let income = 0
    let expenses = 0
    for (const entry of filtered) {
      const amount = entry.amount ?? 0
      if (amount >= 0) {
        income += amount
      } else {
        expenses += amount
      }
    }

    const selectedOwner = journals.length === 1 ? journals[0] : null

    return {
      filteredJournalEntries: filtered,
      availableRefTypes: refTypes,
      selectedOwnerJournal: selectedOwner,
      hasCorporationEntries: hasCorpEntries,
      journalTotals: { income, expenses, net: income + expenses },
    }
  }, [journalByOwner, selectedSet, search, refTypeFilter, divisionFilter])

  const showDivisionColumn = hasCorporationEntries
  const showDivisionFilter = hasCorporationEntries

  useEffect(() => {
    if (refTypeFilter && !availableRefTypes.includes(refTypeFilter)) {
      setRefTypeFilter('')
    }
  }, [availableRefTypes, refTypeFilter])

  useEffect(() => {
    if (divisionFilter !== null && !hasCorporationEntries) {
      setDivisionFilter(null)
    }
  }, [divisionFilter, hasCorporationEntries])

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

  const renderWalletRow = (wallet: typeof sortedWallets[0]) => {
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
      <div key={key} className="border-b border-border/50 last:border-b-0">
        <button
          onClick={() => isCorp && toggle(key)}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm',
            isCorp ? 'hover:bg-surface-secondary/50 cursor-pointer' : 'cursor-default'
          )}
        >
          <div className="w-4 flex justify-center">
            {isCorp ? (
              expanded ? (
                <ChevronDown className="h-4 w-4 text-content-secondary" />
              ) : (
                <ChevronRight className="h-4 w-4 text-content-secondary" />
              )
            ) : (
              <Wallet className="h-4 w-4 text-content-muted" />
            )}
          </div>
          <OwnerIcon
            ownerId={wallet.owner.id}
            ownerType={wallet.owner.type}
            size="md"
          />
          <span className="flex-1 text-content">{wallet.owner.name}</span>
          <span
            className={cn(
              'tabular-nums',
              ownerTotal >= 0 ? 'text-status-positive' : 'text-status-negative'
            )}
          >
            {formatISK(ownerTotal)}
          </span>
        </button>

        {isCorp && expanded && (
          <div className="pb-2">
            {wallet.divisions
              .sort((a, b) => a.division - b.division)
              .map((div) => {
                const customName = getWalletName(wallet.owner.id, div.division)
                const defaultName = DEFAULT_WALLET_NAMES[div.division - 1] ?? `Division ${div.division}`
                const displayName = customName || defaultName

                return (
                  <div
                    key={div.division}
                    className="flex items-center gap-3 py-1.5 pl-12 pr-4 text-sm"
                  >
                    <Building2 className="h-3.5 w-3.5 text-content-muted" />
                    <span className="text-content-secondary flex-1">
                      {displayName}
                    </span>
                    <span
                      className={cn(
                        'tabular-nums',
                        div.balance >= 0 ? 'text-status-positive/80' : 'text-status-negative/80'
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
  }

  const getDivisionFilterName = (div: number): string => {
    const defaultName = DEFAULT_WALLET_NAMES[div - 1] ?? `Division ${div}`
    if (selectedOwnerJournal?.owner.type === 'corporation') {
      return getWalletName(selectedOwnerJournal.owner.id, div) || defaultName
    }
    return defaultName
  }

  return (
    <div className="h-full overflow-auto">
      {characterWallets.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-secondary/30">
          <div className="px-4 py-2 border-b border-border bg-surface-secondary/50">
            <span className="text-xs font-medium uppercase tracking-wider text-content-secondary">
              Characters
            </span>
          </div>
          {characterWallets.map(renderWalletRow)}
        </div>
      )}

      {characterWallets.length > 0 && corporationWallets.length > 0 && (
        <div className="h-4" />
      )}

      {corporationWallets.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-secondary/30">
          <div className="px-4 py-2 border-b border-border bg-surface-secondary/50">
            <span className="text-xs font-medium uppercase tracking-wider text-content-secondary">
              Corporations
            </span>
          </div>
          {corporationWallets.map(renderWalletRow)}
        </div>
      )}

      <div className="h-4" />

      <div className="rounded-lg border border-border bg-surface-secondary/30">
        <button
          onClick={() => setShowJournal(!showJournal)}
          className="w-full px-4 py-2 flex items-center gap-2 border-b border-border bg-surface-secondary/50 hover:bg-surface-secondary/70"
        >
          {showJournal ? (
            <ChevronDown className="h-4 w-4 text-content-secondary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-content-secondary" />
          )}
          <ScrollText className="h-4 w-4 text-content-secondary" />
          <span className="text-xs font-medium uppercase tracking-wider text-content-secondary">
            Journal
          </span>
          {journalByOwner.length > 0 && (
            <span className="ml-auto text-xs text-content-muted">
              {filteredJournalEntries.length} entries
            </span>
          )}
        </button>

        {showJournal && (
          <div>
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
              {availableRefTypes.length > 0 && (
                <select
                  value={refTypeFilter}
                  onChange={(e) => setRefTypeFilter(e.target.value)}
                  className="text-xs bg-surface-secondary border border-border rounded px-2 py-1"
                >
                  <option value="">All Types</option>
                  {availableRefTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </option>
                  ))}
                </select>
              )}
              {showDivisionFilter && (
                <select
                  value={divisionFilter ?? ''}
                  onChange={(e) => setDivisionFilter(e.target.value ? Number(e.target.value) : null)}
                  className="text-xs bg-surface-secondary border border-border rounded px-2 py-1"
                >
                  <option value="">All Divisions</option>
                  {Array.from({ length: CORPORATION_WALLET_DIVISIONS }, (_, i) => i + 1).map((div) => (
                    <option key={div} value={div}>
                      {getDivisionFilterName(div)}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-3 ml-auto text-xs">
                <div className="flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3 text-status-positive" />
                  <span className="tabular-nums text-status-positive">{formatISK(journalTotals.income)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ArrowDownLeft className="h-3 w-3 text-status-negative" />
                  <span className="tabular-nums text-status-negative">{formatISK(journalTotals.expenses)}</span>
                </div>
                <div className="flex items-center gap-1 pl-2 border-l border-border">
                  <span className="text-content-secondary">Net:</span>
                  <span className={cn('tabular-nums font-medium', journalTotals.net >= 0 ? 'text-status-positive' : 'text-status-negative')}>
                    {formatISK(journalTotals.net)}
                  </span>
                </div>
              </div>
            </div>
            <JournalTable
              entries={filteredJournalEntries}
              showOwner={!selectedOwnerJournal}
              showDivision={showDivisionColumn}
              getWalletName={getWalletName}
              corporationId={selectedOwnerJournal?.owner.id}
            />
          </div>
        )}
      </div>
    </div>
  )
}
