import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { FileText, ChevronUp, ChevronDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TypeIcon } from '@/components/ui/type-icon'
import { formatNumber } from '@/lib/utils'
import { getType } from '@/store/cache'
import { Pagination } from './Pagination'
import { ContractTooltip } from './ContractTooltip'
import { ContractContextMenu } from './ContractContextMenu'
import {
  getSecurityColor,
  formatBlueprintName,
  formatTimeLeft,
  formatContractDate,
  decodeHtmlEntities,
  SCAM_THRESHOLD_PCT,
  PAGE_SIZE,
} from './utils'
import type { SearchContract, ContractSearchMode, SortPreset } from './types'
import { SORT_PRESETS } from './types'

export type { SortPreset }
export { SORT_PRESETS }

type SortColumn =
  | 'contract'
  | 'location'
  | 'price'
  | 'estValue'
  | 'difference'
  | 'timeLeft'
  | 'issuer'
  | 'created'
  | 'description'

type SortDirection = 'asc' | 'desc'

function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
  className,
}: {
  column: SortColumn
  label: string
  sortColumn: SortColumn | null
  sortDirection: SortDirection
  onSort: (column: SortColumn) => void
  className?: string
}) {
  const isActive = sortColumn === column
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-surface-tertiary ${className ?? ''}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive &&
          (sortDirection === 'asc' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          ))}
      </div>
    </TableHead>
  )
}

interface ContractsResultsTableProps {
  contracts: SearchContract[]
  mode: ContractSearchMode
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onViewContract: (contract: SearchContract) => void
  isLoading: boolean
}

export function ContractsResultsTable({
  contracts,
  mode,
  page,
  totalPages,
  total,
  onPageChange,
  onViewContract,
  isLoading,
}: ContractsResultsTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [hoveredContract, setHoveredContract] = useState<SearchContract | null>(
    null
  )
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null
  )
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    contract: SearchContract
  } | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null
  )

  const handleSort = useCallback(
    (column: SortColumn) => {
      if (sortColumn === column) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortColumn(column)
        setSortDirection('asc')
      }
    },
    [sortColumn]
  )

  const handleRowHover = useCallback(
    (contract: SearchContract, e: React.MouseEvent) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
      if (contract.topItems.length > 0) {
        const x = e.clientX
        const y = e.clientY
        hoverTimeoutRef.current = setTimeout(() => {
          setCursorPos({ x, y })
          setHoveredContract(contract)
        }, 300)
      }
    },
    []
  )

  const handleRowLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setCursorPos(null)
    setTooltipPos(null)
    setHoveredContract(null)
  }, [])

  useEffect(() => {
    if (!cursorPos || !hoveredContract || !tooltipRef.current) return

    const rect = tooltipRef.current.getBoundingClientRect()
    const padding = 12
    let x = cursorPos.x + padding
    let y = cursorPos.y + padding

    if (x + rect.width > window.innerWidth - padding) {
      x = cursorPos.x - rect.width - padding
    }
    if (y + rect.height > window.innerHeight - padding) {
      y = cursorPos.y - rect.height - padding
    }

    requestAnimationFrame(() => setTooltipPos({ x, y }))
  }, [cursorPos, hoveredContract])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, contract: SearchContract) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, contract })
    },
    []
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const sortedContracts = useMemo(() => {
    if (!sortColumn) return contracts

    return [...contracts].sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortColumn) {
        case 'contract':
          aVal = (a.topItems[0]?.typeName ?? '').toLowerCase()
          bVal = (b.topItems[0]?.typeName ?? '').toLowerCase()
          break
        case 'location':
          aVal = a.systemName.toLowerCase()
          bVal = b.systemName.toLowerCase()
          break
        case 'price':
          aVal = mode === 'courier' ? (a.reward ?? 0) : a.price
          bVal = mode === 'courier' ? (b.reward ?? 0) : b.price
          break
        case 'estValue':
          aVal = a.estValue ?? 0
          bVal = b.estValue ?? 0
          break
        case 'difference': {
          const aPrice = mode === 'courier' ? (a.reward ?? 0) : a.price
          const bPrice = mode === 'courier' ? (b.reward ?? 0) : b.price
          aVal = aPrice - (a.estValue ?? 0)
          bVal = bPrice - (b.estValue ?? 0)
          break
        }
        case 'timeLeft':
          aVal = new Date(a.dateExpired).getTime()
          bVal = new Date(b.dateExpired).getTime()
          break
        case 'issuer':
          aVal = a.issuerName.toLowerCase()
          bVal = b.issuerName.toLowerCase()
          break
        case 'created':
          aVal = new Date(a.dateIssued).getTime()
          bVal = new Date(b.dateIssued).getTime()
          break
        case 'description':
          aVal = a.title.toLowerCase()
          bVal = b.title.toLowerCase()
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [contracts, sortColumn, sortDirection, mode])

  if (contracts.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-content-muted">
        <FileText className="mb-2 h-12 w-12 opacity-50" />
        <p>No contracts found</p>
        <p className="text-sm">Try adjusting your search filters</p>
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
                column="contract"
                label="Contract"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="location"
                label="Location"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="price"
                label={mode === 'courier' ? 'Reward' : 'Price'}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="estValue"
                label="Est. Value"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="difference"
                label="Difference"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="timeLeft"
                label="Time Left"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="issuer"
                label="Issuer"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="created"
                label="Created"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="description"
                label="Description"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedContracts.map((contract) => {
              const price =
                mode === 'courier' ? (contract.reward ?? 0) : contract.price
              const estValue = contract.estValue
              const diff = estValue != null ? price - estValue : null
              const pct = estValue ? (diff! / estValue) * 100 : null

              return (
                <TableRow
                  key={contract.contractId}
                  onMouseEnter={(e) => handleRowHover(contract, e)}
                  onMouseLeave={handleRowLeave}
                  onContextMenu={(e) => handleContextMenu(e, contract)}
                  className={
                    hoveredContract?.contractId === contract.contractId
                      ? 'bg-surface-tertiary'
                      : ''
                  }
                >
                  <TableCell className="font-medium">
                    {contract.topItems.length > 1 ? (
                      '[Multiple Items]'
                    ) : contract.topItems[0] ? (
                      <span className="flex items-center gap-1.5">
                        {contract.topItems[0].typeId && (
                          <TypeIcon
                            typeId={contract.topItems[0].typeId}
                            categoryId={
                              getType(contract.topItems[0].typeId)?.categoryId
                            }
                            isBlueprintCopy={
                              contract.topItems[0].isBlueprintCopy
                            }
                            size="sm"
                          />
                        )}
                        {formatBlueprintName(contract.topItems[0])}
                        {contract.topItems[0].quantity > 1 && (
                          <span className="text-content-secondary">
                            x{contract.topItems[0].quantity.toLocaleString()}
                          </span>
                        )}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      {contract.securityStatus != null && (
                        <>
                          <span
                            className={getSecurityColor(
                              contract.securityStatus
                            )}
                          >
                            {contract.securityStatus.toFixed(1)}
                          </span>{' '}
                        </>
                      )}
                      <span className="text-content">
                        {contract.systemName}
                      </span>
                    </div>
                    <div className="text-xs text-content-muted">
                      {contract.regionName}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">
                    {formatNumber(price)}{' '}
                    <span className="text-content-muted">ISK</span>
                    {mode === 'courier' && contract.collateral && (
                      <div className="text-xs text-content-muted">
                        Collateral: {formatNumber(contract.collateral)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">
                    {estValue != null ? (
                      <>
                        {formatNumber(estValue)}{' '}
                        <span className="text-content-muted">ISK</span>
                      </>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="font-mono">
                    {diff != null && pct != null ? (
                      <span
                        className={
                          diff > 0
                            ? 'text-status-negative'
                            : diff < 0
                              ? 'text-status-positive'
                              : 'text-content-muted'
                        }
                      >
                        {diff >= 0 ? '+' : ''}
                        {formatNumber(diff)}{' '}
                        {Math.abs(pct) >= SCAM_THRESHOLD_PCT ? (
                          <span className="text-status-warning">(Scam?)</span>
                        ) : (
                          `(${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`
                        )}
                      </span>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>{formatTimeLeft(contract.dateExpired)}</TableCell>
                  <TableCell>{contract.issuerName}</TableCell>
                  <TableCell className="text-content-secondary">
                    {formatContractDate(contract.dateIssued)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-content-secondary">
                    {contract.title ? decodeHtmlEntities(contract.title) : '-'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {hoveredContract && hoveredContract.topItems.length > 0 && (
          <ContractTooltip
            ref={tooltipRef}
            contract={hoveredContract}
            position={tooltipPos ?? cursorPos}
            visible={tooltipPos !== null}
          />
        )}

        {contextMenu && (
          <ContractContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            contract={contextMenu.contract}
            onViewContract={onViewContract}
            onClose={closeContextMenu}
          />
        )}
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
