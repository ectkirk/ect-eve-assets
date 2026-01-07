import { useEffect, useMemo } from 'react'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useLoyaltyStore } from '@/store/loyalty-store'
import { useTabControls } from '@/context'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { TabLoadingState } from '@/components/ui/tab-loading-state'
import { CharacterPortrait, CorporationLogo } from '@/components/ui/type-icon'
import { formatNumber } from '@/lib/utils'
import { useSortable, SortableHeader, sortRows } from '@/hooks'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
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

  const names = useReferenceCacheStore((s) => s.names)

  const { search, setSearchPlaceholder, setLoyaltyCorporations } =
    useTabControls()
  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(
    () => new Set(selectedOwnerIds),
    [selectedOwnerIds]
  )

  const { sortColumn, sortDirection, handleSort } = useSortable<SortColumn>(
    'corporation',
    'asc'
  )

  const { rows, corpTotals } = useMemo(() => {
    void names

    const result: LoyaltyRow[] = []
    const corpMap = new Map<number, { name: string; total: number }>()

    const filteredLoyaltyByOwner = loyaltyByOwner.filter(({ owner }) =>
      selectedSet.has(ownerKey(owner.type, owner.characterId))
    )

    for (const { owner, loyaltyPoints } of filteredLoyaltyByOwner) {
      for (const lp of loyaltyPoints) {
        if (lp.loyalty_points <= 0) continue

        const name = names.get(lp.corporation_id)
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
          corpMap.set(lp.corporation_id, {
            name: corpName,
            total: lp.loyalty_points,
          })
        }
      }
    }

    let filtered = result

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (row) =>
          row.ownerName.toLowerCase().includes(searchLower) ||
          row.corporationName.toLowerCase().includes(searchLower)
      )
    }

    const sortedRows = sortRows(
      filtered,
      sortColumn,
      sortDirection,
      (row, column) => {
        switch (column) {
          case 'character':
            return row.ownerName.toLowerCase()
          case 'corporation':
            return row.corporationName.toLowerCase()
          case 'lp':
            return row.loyaltyPoints
          default:
            return 0
        }
      }
    )

    const corpTotals = Array.from(corpMap.entries())
      .map(([id, { name, total }]) => ({ id, name, total }))
      .sort((a, b) => b.total - a.total)

    return { rows: sortedRows, corpTotals }
  }, [loyaltyByOwner, names, search, selectedSet, sortColumn, sortDirection])

  useEffect(() => {
    setSearchPlaceholder('Search character, corporation...')
    return () => setSearchPlaceholder(null)
  }, [setSearchPlaceholder])

  useEffect(() => {
    setLoyaltyCorporations({ corporations: corpTotals })
    return () => setLoyaltyCorporations(null)
  }, [corpTotals, setLoyaltyCorporations])

  const charactersNeedingReauth = useMemo(
    () => owners.filter((o) => o.type === 'character' && o.scopesOutdated),
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
        <p className="text-content-secondary">
          No loyalty points data available.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            <TableRow className="hover:bg-transparent border-b border-border">
              <TableHead className="w-8" />
              <SortableHeader
                column="corporation"
                label="Corporation"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="lp"
                label="LP"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={`${row.ownerId}-${row.corporationId}`}
                className="border-b border-border/50 hover:bg-surface-tertiary/50"
              >
                <TableCell className="py-1.5 w-8">
                  <CharacterPortrait characterId={row.ownerId} size="sm" />
                </TableCell>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <CorporationLogo
                      corporationId={row.corporationId}
                      size="sm"
                    />
                    <span className="truncate" title={row.corporationName}>
                      {row.corporationName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-1.5 text-right tabular-nums text-status-positive">
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
