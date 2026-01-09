import { useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SortableHeader } from '@/components/ui/sortable-header'
import { useSortToggle } from './useSortToggle'
import { formatNumber, formatVolume, formatSecurity } from '@/lib/utils'
import { CopyButton } from '@/components/ui/copy-button'
import { Pagination } from './Pagination'
import {
  getSecurityColor,
  formatTimeLeft,
  PAGE_SIZE,
  HIGHSEC_THRESHOLD,
} from './utils'
import { decodeHtmlEntities } from '@/features/tools/reference/eve-text-utils'
import type { CourierContract } from './types'

type SortColumn =
  | 'route'
  | 'safeJumps'
  | 'directJumps'
  | 'reward'
  | 'collateral'
  | 'volume'
  | 'iskPerJump'
  | 'iskPerM3'
  | 'days'
  | 'timeLeft'

interface EnrichedContract extends CourierContract {
  iskPerJump: number
  iskPerM3: number
  isHighsecOrigin: boolean
  hasSafeData: boolean
  safeMatchesDirect: boolean
  expiryTime: number
}

interface CourierResultsTableProps {
  contracts: CourierContract[]
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  isLoading: boolean
}

const getDefaultSortDirection = (column: SortColumn) =>
  column === 'reward' || column === 'iskPerJump' || column === 'iskPerM3'
    ? 'desc'
    : 'asc'

export function CourierResultsTable({
  contracts,
  page,
  totalPages,
  total,
  onPageChange,
  isLoading,
}: CourierResultsTableProps) {
  const { t } = useTranslation('tools')
  const { sortColumn, sortDirection, handleSort } = useSortToggle(
    getDefaultSortDirection
  )
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    tableRef.current?.scrollTo({ top: 0 })
  }, [page])

  const enrichedContracts = useMemo(
    () =>
      contracts.map((c): EnrichedContract => {
        const iskPerJump = c.directJumps > 0 ? c.reward / c.directJumps : 0
        const iskPerM3 = c.volume > 0 ? c.reward / c.volume : 0
        const isHighsecOrigin =
          c.originSecurity != null && c.originSecurity >= HIGHSEC_THRESHOLD
        const hasSafeData = isHighsecOrigin && c.safeJumps != null
        const safeMatchesDirect = hasSafeData && c.safeJumps === c.directJumps
        return {
          ...c,
          iskPerJump,
          iskPerM3,
          isHighsecOrigin,
          hasSafeData,
          safeMatchesDirect,
          expiryTime: new Date(c.dateExpired).getTime(),
        }
      }),
    [contracts]
  )

  const sortedContracts = useMemo(() => {
    if (!sortColumn) return enrichedContracts

    return [...enrichedContracts].sort((a, b) => {
      let cmp: number
      switch (sortColumn) {
        case 'route':
          cmp = a.originSystem.localeCompare(b.originSystem)
          break
        case 'safeJumps':
          cmp = (a.safeJumps ?? a.directJumps) - (b.safeJumps ?? b.directJumps)
          break
        case 'directJumps':
          cmp = a.directJumps - b.directJumps
          break
        case 'reward':
          cmp = a.reward - b.reward
          break
        case 'collateral':
          cmp = a.collateral - b.collateral
          break
        case 'volume':
          cmp = a.volume - b.volume
          break
        case 'iskPerJump':
          cmp = a.iskPerJump - b.iskPerJump
          break
        case 'iskPerM3':
          cmp = a.iskPerM3 - b.iskPerM3
          break
        case 'days':
          cmp = a.daysToComplete - b.daysToComplete
          break
        case 'timeLeft':
          cmp = a.expiryTime - b.expiryTime
          break
        default:
          return 0
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [enrichedContracts, sortColumn, sortDirection])

  if (contracts.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-content-muted">
        <FileText className="mb-2 h-12 w-12 opacity-50" />
        <p>{t('contractsSearch.noCourierContracts')}</p>
        <p className="text-sm">{t('contractsSearch.adjustFilters')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div
        ref={tableRef}
        className={`flex-1 overflow-auto rounded-lg border border-border bg-surface-secondary/30 ${isLoading ? 'opacity-50' : ''}`}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableHeader
                column="route"
                label={t('contractsSearch.columns.route')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <TableHead>{t('contractsSearch.columns.contract')}</TableHead>
              <SortableHeader
                column="safeJumps"
                label={t('contractsSearch.columns.safe')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-center"
              />
              <SortableHeader
                column="directJumps"
                label={t('contractsSearch.columns.direct')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                className="text-center"
              />
              <SortableHeader
                column="reward"
                label={t('contractsSearch.columns.reward')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="collateral"
                label={t('contractsSearch.columns.collateral')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="volume"
                label={t('contractsSearch.columns.volume')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="iskPerJump"
                label={t('contractsSearch.columns.iskPerJump')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="iskPerM3"
                label={t('contractsSearch.columns.iskPerM3')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="days"
                label={t('contractsSearch.columns.days')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="timeLeft"
                label={t('contractsSearch.columns.expires')}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedContracts.map((c) => (
              <TableRow key={c.contractId}>
                <TableCell>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className={getSecurityColor(c.originSecurity ?? 0)}>
                        {formatSecurity(c.originSecurity ?? 0)}
                      </span>
                      <span>{c.originSystem}</span>
                      <span className="text-content-muted">→</span>
                      <span className={getSecurityColor(c.destSecurity ?? 0)}>
                        {formatSecurity(c.destSecurity ?? 0)}
                      </span>
                      <span>{c.destSystem}</span>
                    </div>
                    <div className="text-xs text-content-muted">
                      {c.originRegion} → {c.destRegion}
                    </div>
                    {(c.originStation || c.destStation) && (
                      <div className="text-xs text-content-secondary">
                        {c.originStation && c.destStation
                          ? `${c.originStation} → ${c.destStation}`
                          : (c.destStation ?? c.originStation)}
                      </div>
                    )}
                    {c.title && (
                      <div className="text-xs text-content-muted italic">
                        {decodeHtmlEntities(c.title)}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <CopyButton
                    text={`<url=contract:${c.originSystemId}//${c.contractId}>${c.originSystem} >> ${c.destSystem} (${formatVolume(c.volume)} m³)</url>`}
                    label=""
                    className="border-0 bg-transparent px-1 py-0.5 hover:bg-surface-tertiary"
                  />
                </TableCell>
                <TableCell className="text-center">
                  {c.hasSafeData ? (
                    c.safeJumps
                  ) : (
                    <span className="text-content-muted">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {c.directJumps > 0 && !c.safeMatchesDirect ? (
                    c.directJumps
                  ) : (
                    <span className="text-content-muted">-</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-status-positive">
                  {formatNumber(c.reward)}
                </TableCell>
                <TableCell className="font-mono text-status-warning">
                  {formatNumber(c.collateral)}
                </TableCell>
                <TableCell className="font-mono">
                  {formatVolume(c.volume)}
                </TableCell>
                <TableCell className="font-mono text-status-highlight">
                  {c.iskPerJump > 0 ? (
                    formatNumber(c.iskPerJump)
                  ) : (
                    <span className="text-content-muted">-</span>
                  )}
                </TableCell>
                <TableCell className="font-mono">
                  {formatNumber(c.iskPerM3)}
                </TableCell>
                <TableCell className="text-center">
                  {c.daysToComplete}
                </TableCell>
                <TableCell>{formatTimeLeft(c.dateExpired)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_SIZE}
        onPageChange={onPageChange}
        isLoading={isLoading}
      />
    </div>
  )
}
