import { useMemo, useState, useEffect, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, Loader2 } from 'lucide-react'
import { type ESIAsset } from '@/api/endpoints/assets'
import { isAbyssalTypeId } from '@/api/mutamarket-client'
import { getAbyssalPrice, getTypeName, getType, getStructure, getLocation, CategoryIds } from '@/store/reference-cache'
import { formatBlueprintName } from '@/store/blueprints-store'
import { useAssetData } from '@/hooks/useAssetData'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useContractsStore } from '@/store/contracts-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { formatNumber, cn } from '@/lib/utils'
import { useTabControls } from '@/context'

interface AssetRow {
  itemId: number
  typeId: number
  typeName: string
  quantity: number
  locationId: number
  locationName: string
  systemName: string
  regionName: string
  locationFlag: string
  isSingleton: boolean
  isBlueprintCopy: boolean
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
  isInContract?: boolean
  isInMarketOrder?: boolean
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

const TOGGLEABLE_COLUMNS = ['ownerName', 'quantity', 'locationFlag', 'price', 'totalValue', 'totalVolume']

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
      const isContract = row.original.isInContract
      const isMarketOrder = row.original.isInMarketOrder

      return (
        <div className="flex items-center gap-2">
          <TypeIcon typeId={typeId} categoryId={categoryId} isBlueprintCopy={isBpc} size="lg" />
          <span className={isBpc ? 'text-status-special' : ''}>{typeName}</span>
          {isContract && (
            <span className="text-xs text-status-corp bg-semantic-warning/20 px-1.5 py-0.5 rounded">In Contract</span>
          )}
          {isMarketOrder && (
            <span className="text-xs text-status-info bg-accent/20 px-1.5 py-0.5 rounded">Sell Order</span>
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
    assetsByOwner,
    owners,
    isLoading,
    hasData,
    hasError,
    errorMessage,
    prices,
    assetNames,
    cacheVersion,
    isRefreshingAbyssals,
    updateProgress,
  } = useAssetData()

  const contractsByOwner = useContractsStore((s) => s.contractsByOwner)
  const ordersByOwner = useMarketOrdersStore((s) => s.dataByOwner)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'totalValue', desc: true }])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility)
  const [categoryFilterValue, setCategoryFilterValue] = useState('')

  const { setColumns, search, setCategoryFilter, setResultCount, setTotalValue } = useTabControls()

  useEffect(() => {
    saveColumnVisibility(columnVisibility)
  }, [columnVisibility])

  const data = useMemo<AssetRow[]>(() => {
    void cacheVersion
    const rows: AssetRow[] = []

    const itemIdToAsset = new Map<number, ESIAsset>()
    for (const { assets } of assetsByOwner) {
      for (const asset of assets) {
        itemIdToAsset.set(asset.item_id, asset)
      }
    }

    const resolveLocation = (asset: ESIAsset): { locationName: string; systemName: string; regionName: string } => {
      let current = asset
      while (current.location_type === 'item') {
        const parent = itemIdToAsset.get(current.location_id)
        if (!parent) break
        current = parent
      }

      let locationName: string
      let systemName = ''
      let regionName = ''

      if (current.location_id > 1_000_000_000_000) {
        // Player structure - location_id is the structure's ID
        const structure = getStructure(current.location_id)
        locationName = structure?.name ?? `Structure ${current.location_id}`
        if (structure?.solarSystemId) {
          const system = getLocation(structure.solarSystemId)
          systemName = system?.name ?? ''
          regionName = system?.regionName ?? ''
        }
      } else if (current.location_type === 'solar_system') {
        // Asset directly in space - check if it's a deployed structure (category 65)
        const type = getType(current.type_id)
        if (type?.categoryId === CategoryIds.STRUCTURE) {
          const structure = getStructure(current.item_id)
          locationName = structure?.name ?? `Structure ${current.item_id}`
          if (structure?.solarSystemId) {
            const system = getLocation(structure.solarSystemId)
            systemName = system?.name ?? ''
            regionName = system?.regionName ?? ''
          }
        } else {
          const system = getLocation(current.location_id)
          locationName = system?.name ?? `System ${current.location_id}`
          systemName = system?.name ?? ''
          regionName = system?.regionName ?? ''
        }
      } else {
        // NPC station
        const location = getLocation(current.location_id)
        locationName = location?.name ?? `Location ${current.location_id}`
        systemName = location?.solarSystemName ?? ''
        regionName = location?.regionName ?? ''
      }

      return { locationName, systemName, regionName }
    }

    for (const { owner, assets } of assetsByOwner) {
      for (const asset of assets) {
        if (asset.location_flag === 'AutoFit') continue
        const sdeType = getType(asset.type_id)
        const customName = assetNames.get(asset.item_id)
        const rawTypeName = getTypeName(asset.type_id)
        const baseName = customName ? `${rawTypeName} (${customName})` : rawTypeName
        const isBlueprint = sdeType?.categoryId === CategoryIds.BLUEPRINT
        const isBpc = asset.is_blueprint_copy ?? false
        const typeName = isBlueprint ? formatBlueprintName(baseName, asset.item_id) : baseName
        const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0

        const abyssalPrice = getAbyssalPrice(asset.item_id)
        const price = isBpc ? 0 : (abyssalPrice ?? prices.get(asset.type_id) ?? 0)

        const isAbyssal = isAbyssalTypeId(asset.type_id)
        const { locationName, systemName, regionName } = resolveLocation(asset)

        rows.push({
          itemId: asset.item_id,
          typeId: asset.type_id,
          typeName,
          quantity: asset.quantity,
          locationId: asset.location_id,
          locationName,
          systemName,
          regionName,
          locationFlag: asset.location_flag,
          isSingleton: asset.is_singleton,
          isBlueprintCopy: isBpc,
          price,
          totalValue: price * asset.quantity,
          volume,
          totalVolume: volume * asset.quantity,
          categoryId: sdeType?.categoryId ?? 0,
          categoryName: isAbyssal ? 'Abyssals' : (sdeType?.categoryName ?? ''),
          groupName: sdeType?.groupName ?? '',
          ownerId: owner.id,
          ownerName: owner.name,
          ownerType: owner.type,
        })
      }
    }

    const ownerIds = new Set(owners.map((o) => o.characterId))
    const ownerCorpIds = new Set(owners.filter((o) => o.corporationId).map((o) => o.corporationId))

    for (const { owner, contracts } of contractsByOwner) {
      for (const { contract, items } of contracts) {
        if (contract.status !== 'outstanding') continue
        const isIssuer = ownerIds.has(contract.issuer_id) || ownerCorpIds.has(contract.issuer_corporation_id)
        if (!isIssuer) continue

        const locationId = contract.start_location_id ?? 0
        let locationName = ''
        let systemName = ''
        let regionName = ''

        if (locationId > 1_000_000_000_000) {
          const structure = getStructure(locationId)
          locationName = structure?.name ?? `Structure ${locationId}`
          if (structure?.solarSystemId) {
            const system = getLocation(structure.solarSystemId)
            systemName = system?.name ?? ''
            regionName = system?.regionName ?? ''
          }
        } else if (locationId >= 60_000_000) {
          const location = getLocation(locationId)
          locationName = location?.name ?? `Location ${locationId}`
          systemName = location?.solarSystemName ?? ''
          regionName = location?.regionName ?? ''
        }

        for (const item of items) {
          if (!item.is_included) continue
          const sdeType = getType(item.type_id)
          const rawTypeName = getTypeName(item.type_id)
          const isBlueprint = sdeType?.categoryId === CategoryIds.BLUEPRINT
          const isBpc = item.is_blueprint_copy ?? false
          const typeName = isBlueprint ? formatBlueprintName(rawTypeName, item.record_id) : rawTypeName
          const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
          const price = isBpc ? 0 : (prices.get(item.type_id) ?? 0)
          const isAbyssal = isAbyssalTypeId(item.type_id)

          rows.push({
            itemId: item.record_id,
            typeId: item.type_id,
            typeName,
            quantity: item.quantity,
            locationId,
            locationName,
            systemName,
            regionName,
            locationFlag: 'In Contract',
            isSingleton: item.is_singleton ?? false,
            isBlueprintCopy: isBpc,
            price,
            totalValue: price * item.quantity,
            volume,
            totalVolume: volume * item.quantity,
            categoryId: sdeType?.categoryId ?? 0,
            categoryName: isAbyssal ? 'Abyssals' : (sdeType?.categoryName ?? ''),
            groupName: sdeType?.groupName ?? '',
            ownerId: owner.id,
            ownerName: owner.name,
            ownerType: owner.type,
            isInContract: true,
          })
        }
      }
    }

    for (const { owner, orders } of ordersByOwner) {
      for (const order of orders) {
        if (order.is_buy_order) continue
        if (order.volume_remain <= 0) continue

        const locationId = order.location_id
        let locationName = ''
        let systemName = ''
        let regionName = ''

        if (locationId > 1_000_000_000_000) {
          const structure = getStructure(locationId)
          locationName = structure?.name ?? `Structure ${locationId}`
          if (structure?.solarSystemId) {
            const system = getLocation(structure.solarSystemId)
            systemName = system?.name ?? ''
            regionName = system?.regionName ?? ''
          }
        } else if (locationId >= 60_000_000) {
          const location = getLocation(locationId)
          locationName = location?.name ?? `Location ${locationId}`
          systemName = location?.solarSystemName ?? ''
          regionName = location?.regionName ?? ''
        }

        const sdeType = getType(order.type_id)
        const typeName = getTypeName(order.type_id)
        const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
        const price = prices.get(order.type_id) ?? 0
        const isAbyssal = isAbyssalTypeId(order.type_id)

        rows.push({
          itemId: order.order_id,
          typeId: order.type_id,
          typeName,
          quantity: order.volume_remain,
          locationId,
          locationName,
          systemName,
          regionName,
          locationFlag: 'Sell Order',
          isSingleton: false,
          isBlueprintCopy: false,
          price,
          totalValue: price * order.volume_remain,
          volume,
          totalVolume: volume * order.volume_remain,
          categoryId: sdeType?.categoryId ?? 0,
          categoryName: isAbyssal ? 'Abyssals' : (sdeType?.categoryName ?? ''),
          groupName: sdeType?.groupName ?? '',
          ownerId: owner.id,
          ownerName: owner.name,
          ownerType: owner.type,
          isInMarketOrder: true,
        })
      }
    }

    const aggregated = new Map<string, AssetRow>()
    for (const row of rows) {
      const isBlueprint = row.categoryId === CategoryIds.BLUEPRINT
      if (isAbyssalTypeId(row.typeId) || (row.isSingleton && !isBlueprint)) {
        aggregated.set(`unique-${row.itemId}`, row)
        continue
      }
      const key = `${row.ownerId}-${row.typeId}-${row.locationId}-${row.locationFlag}-${row.typeName}`
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity += row.quantity
        existing.totalValue += row.totalValue
        existing.totalVolume += row.totalVolume
      } else {
        aggregated.set(key, { ...row })
      }
    }

    return Array.from(aggregated.values())
  }, [assetsByOwner, prices, assetNames, cacheVersion, contractsByOwner, owners, ordersByOwner])

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const row of data) {
      if (row.categoryName) cats.add(row.categoryName)
    }
    return Array.from(cats).sort()
  }, [data])

  const selectedOwnerIds = useAuthStore((s) => s.selectedOwnerIds)
  const selectedSet = useMemo(() => new Set(selectedOwnerIds), [selectedOwnerIds])

  const filteredData = useMemo(() => {
    const searchLower = search.toLowerCase()
    return data.filter((row) => {
      const rowOwnerKey = ownerKey(row.ownerType, row.ownerId)
      if (!selectedSet.has(rowOwnerKey)) return false
      if (categoryFilterValue && row.categoryName !== categoryFilterValue) return false
      if (search) {
        const matchesType = row.typeName.toLowerCase().includes(searchLower)
        const matchesGroup = row.groupName.toLowerCase().includes(searchLower)
        const matchesLocation = row.locationName.toLowerCase().includes(searchLower)
        const matchesSystem = row.systemName.toLowerCase().includes(searchLower)
        const matchesRegion = row.regionName.toLowerCase().includes(searchLower)
        if (!matchesType && !matchesGroup && !matchesLocation && !matchesSystem && !matchesRegion) return false
      }
      return true
    })
  }, [data, categoryFilterValue, search, selectedSet])

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
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
      .filter((col) => col.getCanHide() && TOGGLEABLE_COLUMNS.includes(col.id))
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
    setResultCount({ showing: filteredData.length, total: data.length })
    return () => setResultCount(null)
  }, [filteredData.length, data.length, setResultCount])

  const filteredTotalValue = useMemo(() => {
    return filteredData.reduce((sum, row) => (row.isInContract || row.isInMarketOrder) ? sum : sum + row.totalValue, 0)
  }, [filteredData])

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
      {isRefreshingAbyssals && (
        <div className="flex items-center gap-1 text-sm text-status-info mb-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Fetching abyssal prices...</span>
        </div>
      )}

      <div
        ref={tableContainerRef}
        className="flex-1 min-h-0 rounded-lg border border-border bg-surface-secondary/30 overflow-auto"
      >
        <div className="grid" style={{ gridTemplateColumns: table.getVisibleLeafColumns().map(col => {
          const noFlex = (col.columnDef.meta as { noFlex?: boolean } | undefined)?.noFlex
          return noFlex ? `${col.getSize()}px` : `minmax(${col.getSize()}px, 1fr)`
        }).join(' ') }}>
          <div className="contents">
            {table.getHeaderGroups().map((headerGroup) => (
              headerGroup.headers.filter(h => h.column.getIsVisible()).map((header) => (
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
              ))
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
                const isContract = row.original.isInContract
                const isMarketOrder = row.original.isInMarketOrder
                return (
                  <div key={row.id} data-index={virtualRow.index} className="contents group">
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className={cn(
                          'py-2 text-sm border-b border-border/50 group-hover:bg-surface-tertiary/50 flex items-center',
                          cell.column.id === 'ownerName' ? 'px-2' : 'px-4',
                          isContract && 'bg-row-contract',
                          isMarketOrder && 'bg-row-order'
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                )
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
