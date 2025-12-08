import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronDown, Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuthStore } from '@/store/auth-store'
import { getCharacterAssets, getAssetNames, type ESIAsset } from '@/api/endpoints/assets'
import { getMarketPrices } from '@/api/endpoints/market'
import { getTypeName, getLocationName, getType } from '@/data/sde'

interface AssetRow {
  itemId: number
  typeId: number
  typeName: string
  quantity: number
  locationId: number
  locationName: string
  locationFlag: string
  isSingleton: boolean
  isBlueprintCopy: boolean
  price: number
  totalValue: number
  volume: number
  totalVolume: number
  categoryId: number
}

function formatNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + 'B'
  }
  if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + 'M'
  }
  if (value >= 1_000) {
    return (value / 1_000).toFixed(2) + 'K'
  }
  return value.toLocaleString()
}

function formatVolume(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' m³'
}

const columns: ColumnDef<AssetRow>[] = [
  {
    accessorKey: 'typeName',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50"
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
      return (
        <div className="flex items-center gap-2">
          <img
            src={`https://images.evetech.net/types/${typeId}/icon?size=32`}
            alt=""
            className="h-6 w-6"
            loading="lazy"
          />
          <span className={isBpc ? 'text-cyan-400' : ''}>
            {typeName}
            {isBpc && ' (Copy)'}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: 'quantity',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Quantity
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">
        {(row.getValue('quantity') as number).toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: 'locationName',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Location
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
  },
  {
    accessorKey: 'locationFlag',
    header: 'Flag',
    cell: ({ row }) => {
      const flag = row.getValue('locationFlag') as string
      return <span className="text-slate-400 text-xs">{flag}</span>
    },
  },
  {
    accessorKey: 'price',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Price
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const price = row.getValue('price') as number
      return (
        <span className="tabular-nums text-right block">
          {price > 0 ? formatNumber(price) + ' ISK' : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'totalValue',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Value
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const value = row.getValue('totalValue') as number
      return (
        <span className="tabular-nums text-right block text-green-400">
          {value > 0 ? formatNumber(value) + ' ISK' : '-'}
        </span>
      )
    },
  },
  {
    accessorKey: 'totalVolume',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Volume
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-right block text-slate-400">
        {formatVolume(row.getValue('totalVolume') as number)}
      </span>
    ),
  },
]

export function AssetsTab() {
  const { character } = useAuthStore()
  const characterId = character?.id

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = useState('')

  // Fetch assets
  const {
    data: assets,
    isLoading: assetsLoading,
    error: assetsError,
  } = useQuery({
    queryKey: ['assets', characterId],
    queryFn: () => getCharacterAssets(characterId!),
    enabled: !!characterId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch market prices
  const { data: prices } = useQuery({
    queryKey: ['marketPrices'],
    queryFn: getMarketPrices,
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  // Fetch asset names for named items (ships, containers, etc.)
  const namedItemIds = useMemo(() => {
    if (!assets) return []
    return assets
      .filter((a) => a.is_singleton)
      .map((a) => a.item_id)
  }, [assets])

  const { data: assetNames } = useQuery({
    queryKey: ['assetNames', characterId, namedItemIds],
    queryFn: () => getAssetNames(characterId!, namedItemIds),
    enabled: !!characterId && namedItemIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Build price lookup map
  const priceMap = useMemo(() => {
    const map = new Map<number, number>()
    if (prices) {
      for (const p of prices) {
        map.set(p.type_id, p.average_price ?? p.adjusted_price ?? 0)
      }
    }
    return map
  }, [prices])

  // Build asset name lookup map
  const nameMap = useMemo(() => {
    const map = new Map<number, string>()
    if (assetNames) {
      for (const n of assetNames) {
        if (n.name && n.name !== 'None') {
          map.set(n.item_id, n.name)
        }
      }
    }
    return map
  }, [assetNames])

  // Transform assets to table rows
  const data = useMemo<AssetRow[]>(() => {
    if (!assets) return []

    return assets.map((asset: ESIAsset) => {
      const sdeType = getType(asset.type_id)
      const customName = nameMap.get(asset.item_id)
      const typeName = customName || getTypeName(asset.type_id)
      const price = priceMap.get(asset.type_id) ?? 0
      const volume = sdeType?.volume ?? 0

      return {
        itemId: asset.item_id,
        typeId: asset.type_id,
        typeName,
        quantity: asset.quantity,
        locationId: asset.location_id,
        locationName: getLocationName(asset.location_id),
        locationFlag: asset.location_flag,
        isSingleton: asset.is_singleton,
        isBlueprintCopy: asset.is_blueprint_copy ?? false,
        price,
        totalValue: price * asset.quantity,
        volume,
        totalVolume: volume * asset.quantity,
        categoryId: sdeType?.categoryId ?? 0,
      }
    })
  }, [assets, priceMap, nameMap])

  // Calculate totals
  const totals = useMemo(() => {
    return data.reduce(
      (acc, row) => ({
        totalValue: acc.totalValue + row.totalValue,
        totalVolume: acc.totalVolume + row.totalVolume,
        totalItems: acc.totalItems + row.quantity,
      }),
      { totalValue: 0, totalVolume: 0, totalItems: 0 }
    )
  }, [data])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  })

  if (assetsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-400">Loading assets...</span>
      </div>
    )
  }

  if (assetsError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500">Failed to load assets</p>
          <p className="text-sm text-slate-400">
            {assetsError instanceof Error ? assetsError.message : 'Unknown error'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-slate-400">Items: </span>
            <span className="font-medium">{totals.totalItems.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400">Total Value: </span>
            <span className="font-medium text-green-400">
              {formatNumber(totals.totalValue)} ISK
            </span>
          </div>
          <div>
            <span className="text-slate-400">Total Volume: </span>
            <span className="font-medium">{formatVolume(totals.totalVolume)}</span>
          </div>
        </div>

        {/* Column Visibility */}
        <div className="relative">
          <button className="flex items-center gap-1 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600">
            Columns <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Search assets..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-64 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none"
        />
        <span className="text-sm text-slate-400">
          Showing {table.getFilteredRowModel().rows.length} of {data.length} assets
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-slate-700">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-800 hover:bg-slate-800">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No assets found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="rounded border border-slate-600 px-2 py-1 text-sm disabled:opacity-50 hover:bg-slate-700"
          >
            First
          </button>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded border border-slate-600 px-3 py-1 text-sm disabled:opacity-50 hover:bg-slate-700"
          >
            Previous
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded border border-slate-600 px-3 py-1 text-sm disabled:opacity-50 hover:bg-slate-700"
          >
            Next
          </button>
          <button
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="rounded border border-slate-600 px-2 py-1 text-sm disabled:opacity-50 hover:bg-slate-700"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  )
}
