import { useEffect, useMemo, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useLoyaltyStore } from '@/store/loyalty-store'
import { useTabControls } from '@/context'
import { useCacheVersion } from '@/hooks'
import { hasName, getName } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { CharacterPortrait, CorporationLogo } from '@/components/ui/type-icon'
import { formatNumber } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from '@/components/ui/table'

interface LoyaltyRow {
  ownerId: number
  ownerName: string
  corporationId: number
  corporationName: string
  loyaltyPoints: number
}

type SortColumn = 'character' | 'corporation' | 'lp'
type SortDirection = 'asc' | 'desc'

export function LoyaltyTab() {
  const ownersRecord = useAuthStore((s) => s.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const loyaltyByOwner = useLoyaltyStore((s) => s.dataByOwner)
  const isUpdating = useLoyaltyStore((s) => s.isUpdating)
  const updateError = useLoyaltyStore((s) => s.updateError)
  const init = useLoyaltyStore((s) => s.init)
  const update = useLoyaltyStore((s) => s.update)
  const initialized = useLoyaltyStore((s) => s.initialized)

  useEffect(() => {
    init().then(() => update())
  }, [init, update])

  const cacheVersion = useCacheVersion()

  const { search, setResultCount } = useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const [sortColumn, setSortColumn] = useState<SortColumn>('corporation')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection(column === 'lp' ? 'desc' : 'asc')
    }
  }

  const { rows, corpTotals } = useMemo(() => {
    void cacheVersion

    const result: LoyaltyRow[] = []
    const corpMap = new Map<number, { name: string; total: number }>()

    const filteredLoyaltyByOwner = loyaltyByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.characterId))
    )

    for (const { owner, loyaltyPoints } of filteredLoyaltyByOwner) {
      for (const lp of loyaltyPoints) {
        if (lp.loyalty_points <= 0) continue

        const name = hasName(lp.corporation_id) ? getName(lp.corporation_id) : undefined
        const corpName = name?.name ?? `Corporation ${lp.corporation_id}`

        result.push({
          ownerId: owner.characterId,
          ownerName: owner.name,
          corporationId: lp.corporation_id,
          corporationName: corpName,
          loyaltyPoints: lp.loyalty_points,
        })

        const existing = corpMap.get(lp.corporation_id)
        if (existing) {
          existing.total += lp.loyalty_points
        } else {
          corpMap.set(lp.corporation_id, { name: corpName, total: lp.loyalty_points })
        }
      }
    }

    let filtered = result

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = result.filter((row) =>
        row.ownerName.toLowerCase().includes(searchLower) ||
        row.corporationName.toLowerCase().includes(searchLower)
      )
    }

    const mult = sortDirection === 'asc' ? 1 : -1
    const sortedRows = filtered.sort((a, b) => {
      switch (sortColumn) {
        case 'character':
          return mult * a.ownerName.localeCompare(b.ownerName)
        case 'corporation': {
          const corpCompare = a.corporationName.localeCompare(b.corporationName)
          if (corpCompare !== 0) return mult * corpCompare
          return b.loyaltyPoints - a.loyaltyPoints
        }
        case 'lp':
          return mult * (a.loyaltyPoints - b.loyaltyPoints)
      }
    })

    const corpTotals = Array.from(corpMap.entries())
      .map(([id, { name, total }]) => ({ id, name, total }))
      .sort((a, b) => b.total - a.total)

    return { rows: sortedRows, corpTotals }
  }, [loyaltyByOwner, cacheVersion, search, selectedSet, sortColumn, sortDirection])

  const totalRows = useMemo(() =>
    loyaltyByOwner.reduce((sum, o) => sum + o.loyaltyPoints.filter(lp => lp.loyalty_points > 0).length, 0),
    [loyaltyByOwner]
  )

  useEffect(() => {
    setResultCount({ showing: rows.length, total: totalRows })
    return () => setResultCount(null)
  }, [rows.length, totalRows, setResultCount])

  const charactersNeedingReauth = useMemo(() =>
    owners.filter((o) => o.type === 'character' && o.scopesOutdated),
    [owners]
  )

  const loadingState = TabLoadingState({
    dataType: 'loyalty points',
    initialized,
    isUpdating,
    hasData: loyaltyByOwner.length > 0 || charactersNeedingReauth.length > 0,
    hasOwners: owners.length > 0,
    updateError,
  })
  if (loadingState) return loadingState

  const totalLP = corpTotals.reduce((sum, c) => sum + c.total, 0)

  if (rows.length === 0 && charactersNeedingReauth.length > 0) {
    return (
      <div className="h-full rounded-lg border border-border bg-surface-secondary/30 flex items-center justify-center">
        <div className="text-center">
          <p className="text-content-secondary">
            {charactersNeedingReauth.length === 1
              ? `${charactersNeedingReauth[0]?.name} requires`
              : `${charactersNeedingReauth.length} characters require`}{' '}
            re-authentication for loyalty points access.
          </p>
          <p className="text-content-muted text-sm mt-1">
            Use the character menu to re-authenticate.
          </p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="h-full rounded-lg border border-border bg-surface-secondary/30 flex items-center justify-center">
        <p className="text-content-secondary">No loyalty points data available.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col rounded-lg border border-border bg-surface-secondary/30">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border/50 bg-surface-tertiary/30 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-content-secondary">Total:</span>
          <span className="text-sm font-medium tabular-nums text-semantic-positive">{formatNumber(totalLP)} LP</span>
        </div>
        <div className="h-4 w-px bg-border/50" />
        {corpTotals.slice(0, 6).map((corp) => (
          <div key={corp.id} className="flex items-center gap-2 shrink-0">
            <CorporationLogo corporationId={corp.id} size="sm" />
            <span className="text-xs text-content-secondary truncate max-w-24" title={corp.name}>
              {corp.name}
            </span>
            <span className="text-xs tabular-nums text-semantic-positive">{formatNumber(corp.total)}</span>
          </div>
        ))}
        {corpTotals.length > 6 && (
          <span className="text-xs text-content-muted shrink-0">+{corpTotals.length - 6} more</span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead
              className="w-12 cursor-pointer select-none hover:text-content"
              onClick={() => handleSort('character')}
            >
              <div className="flex items-center gap-1">
                {sortColumn === 'character' && (
                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                )}
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer select-none hover:text-content"
              onClick={() => handleSort('corporation')}
            >
              <div className="flex items-center gap-1">
                Corporation
                {sortColumn === 'corporation' && (
                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                )}
              </div>
            </TableHead>
            <TableHead
              className="text-right cursor-pointer select-none hover:text-content"
              onClick={() => handleSort('lp')}
            >
              <div className="flex items-center justify-end gap-1">
                LP
                {sortColumn === 'lp' && (
                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                )}
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.ownerId}-${row.corporationId}`}>
              <TableCell className="py-1.5 w-12">
                <CharacterPortrait characterId={row.ownerId} size="lg" />
              </TableCell>
              <TableCell className="py-1.5">
                <div className="flex items-center gap-2">
                  <CorporationLogo corporationId={row.corporationId} />
                  <span className="truncate" title={row.corporationName}>
                    {row.corporationName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-1.5 text-right tabular-nums text-semantic-positive">
                {formatNumber(row.loyaltyPoints)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}
