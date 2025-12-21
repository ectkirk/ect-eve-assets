import { useMemo, useState, useEffect, useRef, Fragment } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, Loader2 } from 'lucide-react'
import { isAbyssalTypeId, getMutamarketUrl } from '@/api/mutamarket-client'
import { CategoryIds, hasAbyssal } from '@/store/reference-cache'
import { useResolvedAssets } from '@/hooks/useResolvedAssets'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { AbyssalPreview } from '@/components/ui/abyssal-preview'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { formatNumber, cn } from '@/lib/utils'
import { useTabControls } from '@/context'
import { matchesAssetTypeFilter, matchesSearch, getAssetDisplayNames, type AssetModeFlags, type ResolvedAsset } from '@/lib/resolved-asset'
import { useBlueprintsStore } from '@/store/blueprints-store'

interface AssetRow {
  itemId: number
  typeId: number
  typeName: string
  quantity: number
  locationId: number
  resolvedLocationId: number
  locationName: string
  systemName: string
  regionName: string
  locationFlag: string
  isSingleton: boolean
  isBlueprintCopy: boolean
  isAbyssal: boolean
  price: number
  totalValue: number
  volume: number
  totalVolume: number
  categoryId: number
  categoryName: string
  groupName: string
  ownerId: number
  ownerName: string
  ownerType: 'character' | 'corporation'
  modeFlags: AssetModeFlags
}

function formatVolume(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' m³'
}

const COLUMN_LABELS: Record<string, string> = {
  ownerName: 'Owner',
  quantity: 'Quantity',
  locationFlag: 'Flag',
  price: 'Price',
  totalValue: 'Value',
  totalVolume: 'Volume',
}

const STORAGE_KEY_VISIBILITY = 'assets-column-visibility'

const TOGGLEABLE_COLUMNS = new Set(['ownerName', 'quantity', 'locationFlag', 'price', 'totalValue', 'totalVolume'])

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  locationFlag: false,
  totalVolume: false,
}

function loadColumnVisibility(): VisibilityState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_VISIBILITY)
    return stored ? JSON.parse(stored) : DEFAULT_COLUMN_VISIBILITY
  } catch {
    return DEFAULT_COLUMN_VISIBILITY
  }
}

function saveColumnVisibility(state: VisibilityState): void {
  try {
    localStorage.setItem(STORAGE_KEY_VISIBILITY, JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }
}

function createAssetRow(ra: ResolvedAsset, displayFlag: string, isAbyssal: boolean): AssetRow {
  const names = getAssetDisplayNames(ra)
  return {
    itemId: ra.asset.item_id,
    typeId: ra.typeId,
    typeName: names.typeName,
    quantity: ra.asset.quantity,
    locationId: ra.asset.location_id,
    resolvedLocationId: ra.rootLocationId,
    locationName: names.locationName,
    systemName: names.systemName,
    regionName: names.regionName,
    locationFlag: displayFlag,
    isSingleton: ra.asset.is_singleton,
    isBlueprintCopy: ra.isBlueprintCopy,
    isAbyssal,
    price: ra.price,
    totalValue: ra.totalValue,
    volume: ra.volume,
    totalVolume: ra.totalVolume,
    categoryId: ra.categoryId,
    categoryName: names.categoryName,
    groupName: names.groupName,
    ownerId: ra.owner.id,
    ownerName: ra.owner.name,
    ownerType: ra.owner.type,
    modeFlags: ra.modeFlags,
  }
}

const columns: ColumnDef<AssetRow>[] = [
  {
    accessorKey: 'ownerName',
    size: 40,
    meta: { noFlex: true },
    header: () => <span className="sr-only">Owner</span>,
    cell: ({ row }) => {
      const ownerId = row.original.ownerId
      const name = row.getValue('ownerName') as string
      const ownerType = row.original.ownerType
      return (
        <span title={name}>
          <OwnerIcon ownerId={ownerId} ownerType={ownerType} size="lg" />
        </span>
      )
    },
  },
  {
    accessorKey: 'typeName',
    size: 450,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const typeId = row.original.typeId
      const typeName = row.getValue('typeName') as string
      const isBpc = row.original.isBlueprintCopy
      const categoryId = row.original.categoryId
      const modeFlags = row.original.modeFlags
      const isAbyssalResolved = row.original.isAbyssal && hasAbyssal(row.original.itemId)
      const nameSpan = <span className={cn('truncate', isBpc && 'text-status-special')}>{typeName}</span>

      return (
        <div className="flex flex-nowrap items-center gap-2 min-w-0">
          <TypeIcon typeId={typeId} categoryId={categoryId} isBlueprintCopy={isBpc} size="lg" />
          {isAbyssalResolved ? <AbyssalPreview itemId={row.original.itemId}>{nameSpan}</AbyssalPreview> : nameSpan}
          {(modeFlags.isContract || modeFlags.isMarketOrder || modeFlags.isIndustryJob || modeFlags.isOwnedStructure || modeFlags.isActiveShip) && (
            <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap">
              {modeFlags.isActiveShip && (
                <span className="text-xs text-status-time bg-status-time/20 px-1.5 py-0.5 rounded whitespace-nowrap">Active Ship</span>
              )}
              {modeFlags.isContract && (
                <span className="text-xs text-status-corp bg-semantic-warning/20 px-1.5 py-0.5 rounded whitespace-nowrap">In Contract</span>
              )}
              {modeFlags.isMarketOrder && (
                <span className="text-xs text-status-info bg-accent/20 px-1.5 py-0.5 rounded whitespace-nowrap">Sell Order</span>
              )}
              {modeFlags.isIndustryJob && (
                <span className="text-xs text-status-positive bg-status-positive/20 px-1.5 py-0.5 rounded whitespace-nowrap">In Job</span>
              )}
              {modeFlags.isOwnedStructure && (
                <span className="text-xs text-status-special bg-status-special/20 px-1.5 py-0.5 rounded whitespace-nowrap">Structure</span>
              )}
            </span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'quantity',
    size: 140,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Quantity
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-right w-full">
        {(row.getValue('quantity') as number).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: 'price',
    size: 130,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Price
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const price = row.getValue('price') as number
      return (
        <span className="tabular-nums text-right w-full">
          {price > 0 ? formatNumber(price) + ' ISK' : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'totalValue',
    size: 130,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Value
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const value = row.getValue('totalValue') as number
      return (
        <span className="tabular-nums text-right w-full text-status-positive">
          {value > 0 ? formatNumber(value) + ' ISK' : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'totalVolume',
    size: 130,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Volume
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-right w-full text-content-secondary">
        {formatVolume(row.getValue('totalVolume') as number)}
      </span>
    ),
  },
  {
    accessorKey: 'locationName',
    size: 450,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Location
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-right w-full">{row.getValue('locationName') as string}</span>
    ),
  },
  {
    accessorKey: 'locationFlag',
    size: 140,
    meta: { noFlex: true },
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-content ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Flag
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <div className="w-full text-right">
        <span className="text-content-secondary text-xs">{row.getValue('locationFlag') as string}</span>
      </div>
    ),
  },
]

export function AssetsTab() {
  const {
    selectedResolvedAssets,
    owners,
    isLoading,
    hasData,
    hasError,
    errorMessage,
    cacheVersion,
    updateProgress,
  } = useResolvedAssets()

  const [sorting, setSorting] = useState<SortingState>([{ id: 'totalValue', desc: true }])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility)
  const [categoryFilterValue, setCategoryFilterValue] = useState('')
  const [assetTypeFilterValue, setAssetTypeFilterValue] = useState('')

  const { setColumns, search, setCategoryFilter, setAssetTypeFilter, setResultCount, setTotalValue } = useTabControls()

  useEffect(() => {
    saveColumnVisibility(columnVisibility)
  }, [columnVisibility])

  const blueprintsByItemId = useBlueprintsStore((s) => s.blueprintsByItemId)

  const { data, categories } = useMemo(() => {
    void cacheVersion

    const aggregated = new Map<string, AssetRow>()
    const cats = new Set<string>()

    for (const ra of selectedResolvedAssets) {
      const displayFlag = ra.modeFlags.isContract
        ? 'In Contract'
        : ra.modeFlags.isMarketOrder
          ? 'Sell Order'
          : ra.asset.location_flag

      const isBlueprint = ra.categoryId === CategoryIds.BLUEPRINT
      const isAbyssal = isAbyssalTypeId(ra.typeId)
      const names = getAssetDisplayNames(ra)

      if (names.categoryName) cats.add(names.categoryName)

      if (isAbyssal || (ra.asset.is_singleton && !isBlueprint)) {
        aggregated.set(`unique-${ra.asset.item_id}`, createAssetRow(ra, displayFlag, isAbyssal))
        continue
      }

      let bpSuffix = ''
      if (isBlueprint && ra.isBlueprintCopy) {
        const bp = blueprintsByItemId.get(ra.asset.item_id)
        if (bp) {
          bpSuffix = `-${bp.runs}/${bp.materialEfficiency}/${bp.timeEfficiency}`
        }
      }

      const key = `${ra.owner.id}-${ra.typeId}-${ra.asset.location_id}-${displayFlag}-${ra.rootLocationId}${bpSuffix}`
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity += ra.asset.quantity
        existing.totalValue += ra.totalValue
        existing.totalVolume += ra.totalVolume
      } else {
        aggregated.set(key, createAssetRow(ra, displayFlag, isAbyssal))
      }
    }

    return {
      data: Array.from(aggregated.values()),
      categories: Array.from(cats).sort(),
    }
  }, [selectedResolvedAssets, cacheVersion, blueprintsByItemId])

  const { filteredData, filteredTotalValue, sourceCount } = useMemo(() => {
    const searchLower = search.toLowerCase()
    let totalValue = 0
    let sourceShowing = 0

    for (const ra of selectedResolvedAssets) {
      if (!matchesAssetTypeFilter(ra.modeFlags, assetTypeFilterValue)) continue
      const names = getAssetDisplayNames(ra)
      if (categoryFilterValue && names.categoryName !== categoryFilterValue) continue
      if (search && !matchesSearch(ra, search)) continue
      sourceShowing++
    }

    const filtered = data.filter((row) => {
      if (!matchesAssetTypeFilter(row.modeFlags, assetTypeFilterValue)) return false
      if (categoryFilterValue && row.categoryName !== categoryFilterValue) return false
      if (search) {
        const matches =
          row.typeName.toLowerCase().includes(searchLower) ||
          row.groupName.toLowerCase().includes(searchLower) ||
          row.locationName.toLowerCase().includes(searchLower) ||
          row.systemName.toLowerCase().includes(searchLower) ||
          row.regionName.toLowerCase().includes(searchLower)
        if (!matches) return false
      }
      if (!row.modeFlags.isOwnedStructure && !row.modeFlags.isMarketOrder && !row.modeFlags.isContract) {
        totalValue += row.totalValue
      }
      return true
    })

    return {
      filteredData: filtered,
      filteredTotalValue: totalValue,
      sourceCount: { showing: sourceShowing, total: selectedResolvedAssets.length },
    }
  }, [data, selectedResolvedAssets, assetTypeFilterValue, categoryFilterValue, search])

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  })

  useEffect(() => {
    const cols = table.getAllColumns()
      .filter((col) => col.getCanHide() && TOGGLEABLE_COLUMNS.has(col.id))
      .map((col) => ({
        id: col.id,
        label: COLUMN_LABELS[col.id] ?? col.id,
        visible: col.getIsVisible(),
        toggle: () => col.toggleVisibility(!col.getIsVisible()),
      }))
    setColumns(cols)
    return () => setColumns([])
  }, [table, columnVisibility, setColumns])

  useEffect(() => {
    setCategoryFilter({
      categories,
      value: categoryFilterValue,
      onChange: setCategoryFilterValue,
    })
    return () => setCategoryFilter(null)
  }, [categories, categoryFilterValue, setCategoryFilter])

  useEffect(() => {
    setAssetTypeFilter({
      value: assetTypeFilterValue,
      onChange: setAssetTypeFilterValue,
    })
    return () => setAssetTypeFilter(null)
  }, [assetTypeFilterValue, setAssetTypeFilter])

  useEffect(() => {
    setResultCount(sourceCount)
    return () => setResultCount(null)
  }, [sourceCount, setResultCount])

  useEffect(() => {
    setTotalValue({ value: filteredTotalValue })
    return () => setTotalValue(null)
  }, [filteredTotalValue, setTotalValue])

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const { rows } = table.getRowModel()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 41,
    overscan: 10,
  })

  const gridTemplateColumns = useMemo(() => {
    void columnVisibility
    return table.getVisibleLeafColumns().map(col => {
      const noFlex = (col.columnDef.meta as { noFlex?: boolean } | undefined)?.noFlex
      return noFlex ? `${col.getSize()}px` : `minmax(${col.getSize()}px, 1fr)`
    }).join(' ')
  }, [table, columnVisibility])

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-content-secondary">No characters logged in. Add a character to view assets.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" />
          <p className="mt-2 text-content-secondary">
            {updateProgress
              ? `Fetching assets (${updateProgress.current + 1}/${updateProgress.total})...`
              : 'Loading assets...'}
          </p>
        </div>
      </div>
    )
  }

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {hasError && (
            <>
              <p className="text-semantic-danger">Failed to load assets</p>
              <p className="text-sm text-content-secondary">{errorMessage}</p>
            </>
          )}
          {!hasError && (
            <p className="text-content-secondary">No asset data loaded. Click Update in the header to fetch from ESI.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={tableContainerRef}
        className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-auto"
      >
        <div className="grid" style={{ gridTemplateColumns }}>
          <div className="contents">
            {table.getHeaderGroups().map((headerGroup) => (
              <Fragment key={headerGroup.id}>
                {headerGroup.headers.filter(h => h.column.getIsVisible()).map((header) => (
                  <div
                    key={header.id}
                    className={`sticky top-0 z-10 bg-surface-secondary py-3 text-left text-sm font-medium text-content-secondary border-b border-border ${header.column.id === 'ownerName' ? 'px-2' : 'px-4'}`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
          {rows.length ? (
            <>
              {rowVirtualizer.getVirtualItems().length > 0 && (
                <div style={{ height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0, gridColumn: `1 / -1` }} />
              )}
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]
                if (!row) return null
                const modeFlags = row.original.modeFlags
                const isAbyssalResolved = row.original.isAbyssal && hasAbyssal(row.original.itemId)
                const rowContent = (
                  <div key={row.id} data-index={virtualRow.index} className="contents group">
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className={cn(
                          'py-2 text-sm border-b border-border/50 group-hover:bg-surface-tertiary/50 flex items-center',
                          cell.column.id === 'ownerName' ? 'px-2' : 'px-4',
                          modeFlags.isActiveShip && 'bg-row-active-ship',
                          modeFlags.isContract && 'bg-row-contract',
                          modeFlags.isMarketOrder && 'bg-row-order',
                          modeFlags.isIndustryJob && 'bg-row-industry',
                          modeFlags.isOwnedStructure && 'bg-row-structure'
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                )
                if (isAbyssalResolved) {
                  return (
                    <ContextMenu key={row.id}>
                      <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          onClick={() => window.open(getMutamarketUrl(row.original.typeName, row.original.itemId), '_blank')}
                        >
                          Open in Mutamarket
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                }
                return rowContent
              })}
              {rowVirtualizer.getVirtualItems().length > 0 && (
                <div
                  style={{
                    height: rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                    gridColumn: `1 / -1`,
                  }}
                />
              )}
            </>
          ) : (
            <div className="h-24 flex items-center justify-center text-content-secondary" style={{ gridColumn: `1 / -1` }}>
              No assets found.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
