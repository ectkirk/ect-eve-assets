import {
  useMemo,
  useState,
  useEffect,
  useRef,
  Fragment,
  useCallback,
} from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import { isAbyssalTypeId, getMutamarketUrl } from '@/api/mutamarket-client'
import { CategoryIds, hasAbyssal, getType } from '@/store/reference-cache'
import { useResolvedAssets } from '@/hooks/useResolvedAssets'
import { useRowSelection, useBuybackSelection } from '@/hooks'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { useTabControls } from '@/context'
import {
  matchesAssetTypeFilter,
  matchesSearch,
  getAssetDisplayNames,
} from '@/lib/resolved-asset'
import { useBlueprintsStore } from '@/store/blueprints-store'
import {
  type AssetRow,
  COLUMN_LABELS,
  TOGGLEABLE_COLUMNS,
  loadColumnVisibility,
  saveColumnVisibility,
  createAssetRow,
} from './types'
import { columns } from './columns'

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

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'totalValue', desc: true },
  ])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(loadColumnVisibility)
  const [categoryFilterValue, setCategoryFilterValue] = useState('')
  const [assetTypeFilterValue, setAssetTypeFilterValue] = useState('')

  const {
    setColumns,
    search,
    setCategoryFilter,
    setAssetTypeFilter,
    setResultCount,
    setTotalValue,
  } = useTabControls()

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
        aggregated.set(
          `unique-${ra.asset.item_id}`,
          createAssetRow(ra, displayFlag, isAbyssal)
        )
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
      if (categoryFilterValue && names.categoryName !== categoryFilterValue)
        continue
      if (search && !matchesSearch(ra, search)) continue
      sourceShowing++
    }

    const filtered = data.filter((row) => {
      if (!matchesAssetTypeFilter(row.modeFlags, assetTypeFilterValue))
        return false
      if (categoryFilterValue && row.categoryName !== categoryFilterValue)
        return false
      if (search) {
        const matches =
          row.typeName.toLowerCase().includes(searchLower) ||
          row.groupName.toLowerCase().includes(searchLower) ||
          row.locationName.toLowerCase().includes(searchLower) ||
          row.systemName.toLowerCase().includes(searchLower) ||
          row.regionName.toLowerCase().includes(searchLower)
        if (!matches) return false
      }
      if (
        !row.modeFlags.isOwnedStructure &&
        !row.modeFlags.isMarketOrder &&
        !row.modeFlags.isContract
      ) {
        totalValue += row.totalValue
      }
      return true
    })

    return {
      filteredData: filtered,
      filteredTotalValue: totalValue,
      sourceCount: {
        showing: sourceShowing,
        total: selectedResolvedAssets.length,
      },
    }
  }, [
    data,
    selectedResolvedAssets,
    assetTypeFilterValue,
    categoryFilterValue,
    search,
  ])

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
    const cols = table
      .getAllColumns()
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

  const sortedData = useMemo(() => rows.map((r) => r.original), [rows])
  const getRowId = useCallback(
    (row: AssetRow) => `${row.itemId}-${row.locationId}`,
    []
  )
  const getCopyData = useCallback(
    (row: AssetRow) => ({
      name: getType(row.typeId)?.name ?? row.typeName,
      quantity: row.quantity,
      isItem: true,
    }),
    []
  )
  const { selectedIds, handleRowClick, selectedCount } = useRowSelection({
    items: sortedData,
    getId: getRowId,
    getCopyData,
    containerRef: tableContainerRef,
  })

  const buybackItems = useMemo(
    () =>
      sortedData.map((row) => ({
        id: getRowId(row),
        name: getType(row.typeId)?.name ?? row.typeName,
        quantity: row.quantity,
        locationId: row.resolvedLocationId,
        systemId: row.systemId,
        regionId: row.regionId,
      })),
    [sortedData, getRowId]
  )

  const { canSellToBuyback, handleSellToBuyback } = useBuybackSelection({
    selectedIds,
    items: buybackItems,
  })

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 41,
    overscan: 10,
  })

  const gridTemplateColumns = useMemo(() => {
    void columnVisibility
    return table
      .getVisibleLeafColumns()
      .map((col) => {
        const noFlex = (col.columnDef.meta as { noFlex?: boolean } | undefined)
          ?.noFlex
        return noFlex ? `${col.getSize()}px` : `minmax(${col.getSize()}px, 1fr)`
      })
      .join(' ')
  }, [table, columnVisibility])

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-content-secondary">
          No characters logged in. Add a character to view assets.
        </p>
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
            <p className="text-content-secondary">
              No asset data loaded. Click Update in the header to fetch from
              ESI.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {selectedCount > 0 && (
        <div className="px-3 py-1.5 text-xs text-content-secondary bg-surface-secondary/50 border-b border-border">
          {selectedCount} selected — Ctrl+C to copy
        </div>
      )}
      <div
        ref={tableContainerRef}
        tabIndex={0}
        className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-auto outline-none focus:ring-1 focus:ring-accent/50"
      >
        <div className="grid" style={{ gridTemplateColumns }}>
          <div className="contents">
            {table.getHeaderGroups().map((headerGroup) => (
              <Fragment key={headerGroup.id}>
                {headerGroup.headers
                  .filter((h) => h.column.getIsVisible())
                  .map((header) => (
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
                <div
                  style={{
                    height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0,
                    gridColumn: `1 / -1`,
                  }}
                />
              )}
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index]
                if (!row) return null
                const modeFlags = row.original.modeFlags
                const isAbyssalResolved =
                  row.original.isAbyssal && hasAbyssal(row.original.itemId)
                const rowId = getRowId(row.original)
                const isRowSelected = selectedIds.has(rowId)
                const rowContent = (
                  <div
                    key={row.id}
                    data-index={virtualRow.index}
                    className="contents group cursor-pointer select-none"
                    onClick={(e) => handleRowClick(rowId, e)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className={cn(
                          'py-2 text-sm border-b border-border/50 group-hover:bg-surface-tertiary/50 flex items-center',
                          cell.column.id === 'ownerName' ? 'px-2' : 'px-4',
                          isRowSelected && 'bg-accent/20',
                          !isRowSelected &&
                            modeFlags.isActiveShip &&
                            'bg-row-active-ship',
                          !isRowSelected &&
                            modeFlags.isContract &&
                            'bg-row-contract',
                          !isRowSelected &&
                            modeFlags.isMarketOrder &&
                            'bg-row-order',
                          !isRowSelected &&
                            modeFlags.isIndustryJob &&
                            'bg-row-industry',
                          !isRowSelected &&
                            modeFlags.isOwnedStructure &&
                            'bg-row-structure'
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </div>
                    ))}
                  </div>
                )
                const showBuybackOption = isRowSelected && canSellToBuyback
                if (isAbyssalResolved || showBuybackOption) {
                  return (
                    <ContextMenu key={row.id}>
                      <ContextMenuTrigger asChild>
                        {rowContent}
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        {showBuybackOption && (
                          <ContextMenuItem onClick={handleSellToBuyback}>
                            Sell to buyback
                          </ContextMenuItem>
                        )}
                        {isAbyssalResolved && (
                          <ContextMenuItem
                            onClick={() =>
                              window.open(
                                getMutamarketUrl(
                                  row.original.typeName,
                                  row.original.itemId
                                ),
                                '_blank'
                              )
                            }
                          >
                            Open in Mutamarket
                          </ContextMenuItem>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                }
                return rowContent
              })}
              {rowVirtualizer.getVirtualItems().length > 0 && (
                <div
                  style={{
                    height:
                      rowVirtualizer.getTotalSize() -
                      (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                    gridColumn: `1 / -1`,
                  }}
                />
              )}
            </>
          ) : (
            <div
              className="h-24 flex items-center justify-center text-content-secondary"
              style={{ gridColumn: `1 / -1` }}
            >
              No assets found.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
