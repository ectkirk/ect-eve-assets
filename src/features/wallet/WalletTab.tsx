import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Wallet, Building2, ScrollText, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { useAuthStore, ownerKey, type Owner } from '@/store/auth-store'
import { useWalletStore, isCorporationWallet } from '@/store/wallet-store'
import { useWalletJournalStore, type JournalEntry } from '@/store/wallet-journal-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { useAssetData } from '@/hooks/useAssetData'
import { OwnerIcon } from '@/components/ui/type-icon'
import { cn, formatISK } from '@/lib/utils'
import { useTabControls } from '@/context'
import { useColumnSettings, useExpandCollapse, type ColumnConfig } from '@/hooks'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const DEFAULT_WALLET_NAMES = [
  'Master Wallet',
  '2nd Wallet Division',
  '3rd Wallet Division',
  '4th Wallet Division',
  '5th Wallet Division',
  '6th Wallet Division',
  '7th Wallet Division',
]

const PAGE_SIZE = 50

function formatRefType(refType: string): string {
  return refType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface JournalEntryWithOwner extends JournalEntry {
  owner: Owner
}

function JournalTable({
  entries,
  showOwner = false,
  showDivision = false,
  getWalletName,
  corporationId,
}: {
  entries: JournalEntryWithOwner[]
  showOwner?: boolean
  showDivision?: boolean
  getWalletName?: (corpId: number, division: number) => string | undefined
  corporationId?: number
}) {
  const [page, setPage] = useState(0)

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const paginatedEntries = entries.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)

  if (entries.length === 0) {
    return <div className="text-center py-8 text-content-secondary">No journal entries</div>
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {showOwner && <TableHead className="w-8"></TableHead>}
            <TableHead className="w-32">Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="max-w-md">Description</TableHead>
            {showDivision && <TableHead className="w-32">Division</TableHead>}
            <TableHead className="text-right w-36">Amount</TableHead>
            <TableHead className="text-right w-36">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEntries.map((entry) => {
            const isPositive = (entry.amount ?? 0) >= 0
            const corpId = corporationId ?? (entry.owner.type === 'corporation' ? entry.owner.id : undefined)
            const divisionName = showDivision && entry.division
              ? (getWalletName && corpId ? getWalletName(corpId, entry.division) : null) || DEFAULT_WALLET_NAMES[entry.division - 1]
              : undefined

            return (
              <TableRow key={`${entry.owner.type}-${entry.owner.id}-${entry.id}`}>
                {showOwner && (
                  <TableCell className="py-1.5 w-8">
                    <OwnerIcon ownerId={entry.owner.id} ownerType={entry.owner.type} size="sm" />
                  </TableCell>
                )}
                <TableCell className="py-1.5 text-content-secondary text-xs">
                  {formatDate(entry.date)}
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    {isPositive ? (
                      <ArrowDownLeft className="h-3.5 w-3.5 text-status-positive" />
                    ) : (
                      <ArrowUpRight className="h-3.5 w-3.5 text-status-negative" />
                    )}
                    <span className="text-xs">{formatRefType(entry.ref_type)}</span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 max-w-md">
                  <span className="text-content-secondary text-xs truncate block" title={entry.description}>
                    {entry.description}
                  </span>
                </TableCell>
                {showDivision && (
                  <TableCell className="py-1.5 text-content-secondary text-xs">
                    {divisionName}
                  </TableCell>
                )}
                <TableCell className={cn(
                  'py-1.5 text-right tabular-nums text-xs',
                  isPositive ? 'text-status-positive' : 'text-status-negative'
                )}>
                  {entry.amount !== undefined ? formatISK(entry.amount) : '-'}
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums text-xs text-content-secondary">
                  {entry.balance !== undefined ? formatISK(entry.balance) : '-'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-2 text-sm border-t border-border/50">
          <span className="text-content-secondary text-xs">
            {clampedPage * PAGE_SIZE + 1}-{Math.min((clampedPage + 1) * PAGE_SIZE, entries.length)} of {entries.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={clampedPage === 0}
              className="px-2 py-1 rounded text-xs hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => setPage(clampedPage - 1)}
              disabled={clampedPage === 0}
              className="px-2 py-1 rounded text-xs hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="px-2 py-1 text-content-secondary text-xs">
              {clampedPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(clampedPage + 1)}
              disabled={clampedPage >= totalPages - 1}
              className="px-2 py-1 rounded text-xs hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={clampedPage >= totalPages - 1}
              className="px-2 py-1 rounded text-xs hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </>
  )
}

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

  const activeOwnerId = useAuthStore((s) => s.activeOwnerId)

  const { characterWallets, corporationWallets } = useMemo(() => {
    let filtered = walletsByOwner
    if (activeOwnerId !== null) {
      filtered = walletsByOwner.filter((w) => ownerKey(w.owner.type, w.owner.id) === activeOwnerId)
    }

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
  }, [walletsByOwner, search, activeOwnerId])

  const sortedWallets = useMemo(
    () => [...characterWallets, ...corporationWallets],
    [characterWallets, corporationWallets]
  )

  const { filteredJournalEntries, availableRefTypes, selectedOwnerJournal } = useMemo(() => {
    let journals = journalByOwner
    if (activeOwnerId !== null) {
      journals = journalByOwner.filter((j) => ownerKey(j.owner.type, j.owner.id) === activeOwnerId)
    }

    const allEntries = journals
      .flatMap((j) => j.entries.map((e) => ({ ...e, owner: j.owner })))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const refTypes = [...new Set(allEntries.map((e) => e.ref_type))].sort()

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

    const selectedOwner = journals.length === 1 ? journals[0] : null

    return {
      filteredJournalEntries: filtered,
      availableRefTypes: refTypes,
      selectedOwnerJournal: selectedOwner,
    }
  }, [journalByOwner, activeOwnerId, search, refTypeFilter, divisionFilter])

  const showDivisionColumn = filteredJournalEntries.some((e) => e.division !== undefined)
  const showDivisionFilter = selectedOwnerJournal?.owner.type === 'corporation'

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
            {(availableRefTypes.length > 0 || showDivisionFilter) && (
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
                        {formatRefType(type)}
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
                    {[1, 2, 3, 4, 5, 6, 7].map((div) => {
                      const name = selectedOwnerJournal
                        ? getWalletName(selectedOwnerJournal.owner.id, div) || DEFAULT_WALLET_NAMES[div - 1]
                        : DEFAULT_WALLET_NAMES[div - 1]
                      return (
                        <option key={div} value={div}>
                          {name}
                        </option>
                      )
                    })}
                  </select>
                )}
              </div>
            )}
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
