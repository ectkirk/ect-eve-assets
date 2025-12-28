import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { FileText } from 'lucide-react'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SortableHeader } from '@/components/ui/sortable-header'
import { Pagination } from './Pagination'
import { ContractTooltip } from './ContractTooltip'
import { ContractContextMenu } from './ContractContextMenu'
import { ContractRow } from './ContractRow'
import { PAGE_SIZE } from './utils'
import { useAuctionBids } from './useContractBids'
import { useSortToggle } from './useSortToggle'
import type { SearchContract } from './types'

type SortColumn =
  | 'contract'
  | 'location'
  | 'price'
  | 'estValue'
  | 'difference'
  | 'timeLeft'
  | 'created'
  | 'description'

interface ContractsResultsTableProps {
  contracts: SearchContract[]
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
  onViewContract: (contract: SearchContract) => void
  isLoading: boolean
}

export function ContractsResultsTable({
  contracts,
  page,
  totalPages,
  total,
  onPageChange,
  onViewContract,
  isLoading,
}: ContractsResultsTableProps) {
  const { sortColumn, sortDirection, handleSort } = useSortToggle<SortColumn>()
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

  const auctionContractIds = useMemo(
    () =>
      contracts.filter((c) => c.type === 'auction').map((c) => c.contractId),
    [contracts]
  )
  const { highestBids } = useAuctionBids(auctionContractIds)

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

  useEffect(() => {
    tableRef.current?.scrollTo({ top: 0 })
  }, [page])

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
          aVal = a.price
          bVal = b.price
          break
        case 'estValue':
          aVal = a.estValue ?? 0
          bVal = b.estValue ?? 0
          break
        case 'difference':
          aVal = a.price - (a.estValue ?? 0)
          bVal = b.price - (b.estValue ?? 0)
          break
        case 'timeLeft':
          aVal = new Date(a.dateExpired).getTime()
          bVal = new Date(b.dateExpired).getTime()
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
  }, [contracts, sortColumn, sortDirection])

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
              <TableHead className="w-10"></TableHead>
              <SortableHeader
                column="location"
                label="Location"
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                column="price"
                label="Price"
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
            {sortedContracts.map((contract) => (
              <ContractRow
                key={contract.contractId}
                contract={contract}
                highestBid={highestBids.get(contract.contractId)}
                isHovered={hoveredContract?.contractId === contract.contractId}
                onMouseEnter={handleRowHover}
                onMouseLeave={handleRowLeave}
                onContextMenu={handleContextMenu}
              />
            ))}
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
