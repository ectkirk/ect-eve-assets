import { useEffect, useMemo, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Building2 } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import {
  useWalletStore,
  isCorporationWallet,
  type CharacterWallet,
  type CorporationWallet,
} from '@/store/wallet-store'
import { useDivisionsStore } from '@/store/divisions-store'
import { useAssetData } from '@/hooks/useAssetData'
import { OwnerIcon } from '@/components/ui/type-icon'
import { cn, formatNumber } from '@/lib/utils'
import { useTabControls } from '@/context'
import {
  useExpandCollapse,
  useSortable,
  SortableHeader,
  sortRows,
} from '@/hooks'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type WalletSortColumn = 'owner' | 'balance'

const WALLET_DIVISION_KEYS = [
  'master',
  'wallet2',
  'wallet3',
  'wallet4',
  'wallet5',
  'wallet6',
  'wallet7',
]

function getWalletBalance(wallet: CharacterWallet | CorporationWallet): number {
  return isCorporationWallet(wallet)
    ? wallet.divisions.reduce((sum, d) => sum + d.balance, 0)
    : wallet.balance
}

export function WalletTab() {
  const { t } = useTranslation('wallet')
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

  const { setExpandCollapse, search, setTotalValue } = useTabControls()

  const expandableKeys = useMemo(
    () =>
      walletsByOwner
        .filter((w) => isCorporationWallet(w))
        .map((w) => `${w.owner.type}-${w.owner.id}`),
    [walletsByOwner]
  )

  const { isExpanded, toggle } = useExpandCollapse(
    expandableKeys,
    setExpandCollapse
  )

  const { sortColumn, sortDirection, handleSort } =
    useSortable<WalletSortColumn>('balance', 'desc')

  const totalBalance = useMemo(
    () => walletsByOwner.reduce((sum, w) => sum + getWalletBalance(w), 0),
    [walletsByOwner]
  )

  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const sortedWallets = useMemo(() => {
    let filtered = walletsByOwner.filter((w) =>
      selectedSet.has(ownerKey(w.owner.type, w.owner.id))
    )

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter((wallet) =>
        wallet.owner.name.toLowerCase().includes(searchLower)
      )
    }

    return sortRows(filtered, sortColumn, sortDirection, (wallet, column) => {
      switch (column) {
        case 'owner':
          return wallet.owner.name.toLowerCase()
        case 'balance':
          return getWalletBalance(wallet)
        default:
          return 0
      }
    })
  }, [walletsByOwner, search, selectedSet, sortColumn, sortDirection])

  useEffect(() => {
    setTotalValue({ value: totalBalance })
    return () => setTotalValue(null)
  }, [totalBalance, setTotalValue])

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
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            <TableRow className="hover:bg-transparent border-b border-border">
              <SortableHeader
                column="owner"
                label="columns.owner"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="balance"
                label="columns.balance"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right w-40"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedWallets.map((wallet) => {
              const key = `${wallet.owner.type}-${wallet.owner.id}`
              const isCorp = isCorporationWallet(wallet)
              const expanded = isExpanded(key)
              const ownerTotal = getWalletBalance(wallet)

              return (
                <WalletRow
                  key={key}
                  rowKey={key}
                  wallet={wallet}
                  isCorp={isCorp}
                  expanded={expanded}
                  ownerTotal={ownerTotal}
                  toggle={toggle}
                  getWalletName={getWalletName}
                  t={t}
                />
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

interface WalletRowProps {
  rowKey: string
  wallet: CharacterWallet | CorporationWallet
  isCorp: boolean
  expanded: boolean
  ownerTotal: number
  toggle: (key: string) => void
  getWalletName: (corporationId: number, division: number) => string | undefined
  t: (key: string, options?: Record<string, unknown>) => string
}

function WalletRow({
  rowKey,
  wallet,
  isCorp,
  expanded,
  ownerTotal,
  toggle,
  getWalletName,
  t,
}: WalletRowProps) {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight

  return (
    <Fragment>
      <TableRow
        onClick={() => isCorp && toggle(rowKey)}
        className={cn(
          'border-b border-border/50 hover:bg-surface-tertiary/50',
          isCorp && 'cursor-pointer'
        )}
      >
        <TableCell className="py-1.5 px-4">
          <div className="flex items-center gap-3">
            {isCorp ? (
              <ChevronIcon className="h-4 w-4 shrink-0 text-content-secondary" />
            ) : (
              <div className="w-4" />
            )}
            <OwnerIcon
              ownerId={wallet.owner.id}
              ownerType={wallet.owner.type}
              size="sm"
            />
            <span>{wallet.owner.name}</span>
          </div>
        </TableCell>
        <TableCell className="py-1.5 px-4 text-right">
          <span
            className={cn(
              'tabular-nums',
              ownerTotal >= 0 ? 'text-status-positive' : 'text-status-negative'
            )}
          >
            {formatNumber(ownerTotal)}
          </span>
        </TableCell>
      </TableRow>
      {isCorp &&
        expanded &&
        (wallet as CorporationWallet).divisions
          .sort((a, b) => a.division - b.division)
          .map((div) => {
            const customName = getWalletName(wallet.owner.id, div.division)
            const divKey = WALLET_DIVISION_KEYS[div.division - 1]
            const defaultName = divKey
              ? t(`divisions.${divKey}`)
              : t('divisions.division', { number: div.division })
            const displayName = customName || defaultName

            return (
              <TableRow
                key={div.division}
                className="border-b border-border/50 bg-surface-tertiary/50"
              >
                <TableCell className="py-1.5 pl-16 pr-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-content-muted" />
                    <span className="text-content-secondary">
                      {displayName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 px-4 text-right">
                  <span
                    className={cn(
                      'tabular-nums',
                      div.balance >= 0
                        ? 'text-status-positive/80'
                        : 'text-status-negative/80'
                    )}
                  >
                    {formatNumber(div.balance)}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
    </Fragment>
  )
}
