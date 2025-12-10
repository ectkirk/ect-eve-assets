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
  type ColumnOrderState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, Loader2 } from 'lucide-react'
import { type ESIAsset } from '@/api/endpoints/assets'
import { isAbyssalTypeId, getCachedAbyssalPrice } from '@/api/mutamarket-client'
import { getAbyssalPrice, getTypeName, getType, getStructure, getLocation, CategoryIds } from '@/store/reference-cache'
import { useAssetData } from '@/hooks/useAssetData'
import { useAuthStore, ownerKey } from '@/store/auth-store'
import { useMarketOrdersStore } from '@/store/market-orders-store'
import { useIndustryJobsStore } from '@/store/industry-jobs-store'
import { useContractsStore } from '@/store/contracts-store'
import { TypeIcon, OwnerIcon } from '@/components/ui/type-icon'
import { formatNumber } from '@/lib/utils'
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
}


function formatVolume(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' m³'
}

const COLUMN_LABELS: Record<string, string> = {
  ownerName: 'Owner',
  typeName: 'Name',
  quantity: 'Quantity',
  locationName: 'Location',
  locationFlag: 'Flag',
  price: 'Price',
  totalValue: 'Value',
  totalVolume: 'Volume',
}

const STORAGE_KEY_VISIBILITY = 'assets-column-visibility'
const STORAGE_KEY_ORDER = 'assets-column-order'

const DEFAULT_COLUMN_ORDER: ColumnOrderState = [
  'ownerName',
  'typeName',
  'quantity',
  'locationName',
  'locationFlag',
  'price',
  'totalValue',
  'totalVolume',
]

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  locationFlag: false,
  price: false,
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

function loadColumnOrder(): ColumnOrderState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_ORDER)
    return stored ? JSON.parse(stored) : DEFAULT_COLUMN_ORDER
  } catch {
    return DEFAULT_COLUMN_ORDER
  }
}

function saveColumnOrder(state: ColumnOrderState): void {
  try {
    localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(state))
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
    size: 280,
    meta: { noFlex: true },
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
      const categoryId = row.original.categoryId

      return (
        <div className="flex items-center gap-2">
          <TypeIcon typeId={typeId} categoryId={categoryId} isBlueprintCopy={isBpc} size="lg" />
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
    size: 100,
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
    size: 300,
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
    size: 100,
    header: 'Flag',
    cell: ({ row }) => {
      const flag = row.getValue('locationFlag') as string
      return <span className="text-slate-400 text-xs">{flag}</span>
    },
  },
  {
    accessorKey: 'price',
    size: 120,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50 ml-auto"
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
    size: 120,
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50 ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Value
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const value = row.getValue('totalValue') as number
      return (
        <span className="tabular-nums text-right w-full text-green-400">
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
        className="flex items-center gap-1 hover:text-slate-50 ml-auto"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Volume
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-right w-full text-slate-400">
        {formatVolume(row.getValue('totalVolume') as number)}
      </span>
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

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility)
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(loadColumnOrder)
  const [categoryFilterValue, setCategoryFilterValue] = useState('')
  const draggedColumnRef = useRef<string | null>(null)

  const { setColumns, search, setCategoryFilter, setResultCount } = useTabControls()

  useEffect(() => {
    saveColumnVisibility(columnVisibility)
  }, [columnVisibility])

  useEffect(() => {
    saveColumnOrder(columnOrder)
  }, [columnOrder])

  const ordersByOwner = useMarketOrdersStore((s) => s.ordersByOwner)
  const jobsByOwner = useIndustryJobsStore((s) => s.jobsByOwner)
  const contractsByOwner = useContractsStore((s) => s.contractsByOwner)

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
        const sdeType = getType(asset.type_id)
        const customName = assetNames.get(asset.item_id)
        const typeName = customName || getTypeName(asset.type_id)
        const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0

        const abyssalPrice = getAbyssalPrice(asset.item_id)
        const price = abyssalPrice ?? prices.get(asset.type_id) ?? 0

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
          isBlueprintCopy: asset.is_blueprint_copy ?? false,
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

    const resolveLocationById = (locationId: number): { locationName: string; systemName: string; regionName: string } => {
      if (locationId > 1_000_000_000_000) {
        const structure = getStructure(locationId)
        const locationName = structure?.name ?? `Structure ${locationId}`
        let systemName = ''
        let regionName = ''
        if (structure?.solarSystemId) {
          const system = getLocation(structure.solarSystemId)
          systemName = system?.name ?? ''
          regionName = system?.regionName ?? ''
        }
        return { locationName, systemName, regionName }
      }
      const location = getLocation(locationId)
      return {
        locationName: location?.name ?? `Location ${locationId}`,
        systemName: location?.solarSystemName ?? '',
        regionName: location?.regionName ?? '',
      }
    }

    for (const { owner, orders } of ordersByOwner) {
      for (const order of orders) {
        const sdeType = getType(order.type_id)
        const typeName = getTypeName(order.type_id)
        const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
        const quantity = order.volume_remain
        const { locationName, systemName, regionName } = resolveLocationById(order.location_id)

        rows.push({
          itemId: order.order_id,
          typeId: order.type_id,
          typeName,
          quantity,
          locationId: order.location_id,
          locationName,
          systemName,
          regionName,
          locationFlag: order.is_buy_order ? 'Buy Order' : 'Sell Order',
          isSingleton: false,
          isBlueprintCopy: false,
          price: order.price,
          totalValue: order.is_buy_order ? (order.escrow ?? 0) : order.price * quantity,
          volume,
          totalVolume: volume * quantity,
          categoryId: sdeType?.categoryId ?? 0,
          categoryName: sdeType?.categoryName ?? '',
          groupName: sdeType?.groupName ?? '',
          ownerId: owner.id,
          ownerName: owner.name,
          ownerType: owner.type,
        })
      }
    }

    for (const { owner, jobs } of jobsByOwner) {
      for (const job of jobs) {
        if (job.status !== 'active' && job.status !== 'ready') continue
        const productTypeId = job.product_type_id ?? job.blueprint_type_id
        const sdeType = getType(productTypeId)
        const typeName = getTypeName(productTypeId)
        const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
        const price = prices.get(productTypeId) ?? 0
        const { locationName, systemName, regionName } = resolveLocationById(job.output_location_id)

        rows.push({
          itemId: job.job_id,
          typeId: productTypeId,
          typeName,
          quantity: job.runs,
          locationId: job.output_location_id,
          locationName,
          systemName,
          regionName,
          locationFlag: 'Industry Job',
          isSingleton: false,
          isBlueprintCopy: false,
          price,
          totalValue: price * job.runs,
          volume,
          totalVolume: volume * job.runs,
          categoryId: sdeType?.categoryId ?? 0,
          categoryName: sdeType?.categoryName ?? '',
          groupName: sdeType?.groupName ?? '',
          ownerId: owner.id,
          ownerName: owner.name,
          ownerType: owner.type,
        })
      }
    }

    const ownerIds = new Set(owners.map((o) => o.characterId))
    const ownerCorpIds = new Set(owners.filter((o) => o.corporationId).map((o) => o.corporationId!))
    const seenContracts = new Set<number>()

    for (const { owner, contracts } of contractsByOwner) {
      for (const { contract, items } of contracts) {
        if (seenContracts.has(contract.contract_id)) continue
        seenContracts.add(contract.contract_id)
        if (contract.status !== 'outstanding' && contract.status !== 'in_progress') continue
        if (contract.type === 'courier') continue

        const isIssuer = ownerIds.has(contract.issuer_id)
        const isAssignee = ownerIds.has(contract.assignee_id) || ownerCorpIds.has(contract.assignee_id)
        const flag = isIssuer ? 'Contract Out' : isAssignee ? 'Contract In' : 'Contract'
        const valueMultiplier = isAssignee && !isIssuer ? -1 : 1

        for (const item of items) {
          if (!item.is_included) continue
          const sdeType = getType(item.type_id)
          const typeName = getTypeName(item.type_id)
          const volume = sdeType?.packagedVolume ?? sdeType?.volume ?? 0
          let price: number
          if (isAbyssalTypeId(item.type_id) && item.item_id) {
            price = getCachedAbyssalPrice(item.item_id) ?? 0
          } else {
            price = prices.get(item.type_id) ?? 0
          }
          const contractLocationId = contract.start_location_id ?? 0
          const { locationName, systemName, regionName } = resolveLocationById(contractLocationId)

          rows.push({
            itemId: item.record_id,
            typeId: item.type_id,
            typeName,
            quantity: item.quantity,
            locationId: contractLocationId,
            locationName,
            systemName,
            regionName,
            locationFlag: flag,
            isSingleton: item.is_singleton ?? false,
            isBlueprintCopy: item.is_blueprint_copy ?? false,
            price,
            totalValue: price * item.quantity * valueMultiplier,
            volume,
            totalVolume: volume * item.quantity,
            categoryId: sdeType?.categoryId ?? 0,
            categoryName: sdeType?.categoryName ?? '',
            groupName: sdeType?.groupName ?? '',
            ownerId: owner.id,
            ownerName: owner.name,
            ownerType: owner.type,
          })
        }
      }
    }

    return rows
  }, [assetsByOwner, prices, assetNames, cacheVersion, ordersByOwner, jobsByOwner, contractsByOwner, owners])

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const row of data) {
      if (row.categoryName) cats.add(row.categoryName)
    }
    return Array.from(cats).sort()
  }, [data])

  const activeOwnerId = useAuthStore((s) => s.activeOwnerId)

  const filteredData = useMemo(() => {
    const searchLower = search.toLowerCase()
    return data.filter((row) => {
      if (activeOwnerId !== null) {
        const rowOwnerKey = ownerKey(row.ownerType, row.ownerId)
        if (rowOwnerKey !== activeOwnerId) return false
      }
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
  }, [data, categoryFilterValue, search, activeOwnerId])

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
    },
  })

  useEffect(() => {
    const cols = table.getAllColumns()
      .filter((col) => col.getCanHide())
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

  const handleDragStart = (e: React.DragEvent, columnId: string) => {
    draggedColumnRef.current = columnId
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    const draggedId = draggedColumnRef.current
    if (!draggedId || draggedId === targetColumnId) return

    const newOrder = [...columnOrder]
    const draggedIndex = newOrder.indexOf(draggedId)
    const targetIndex = newOrder.indexOf(targetColumnId)

    if (draggedIndex === -1 || targetIndex === -1) return

    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, draggedId)
    setColumnOrder(newOrder)
    draggedColumnRef.current = null
  }

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
        <p className="text-slate-400">No characters logged in. Add a character to view assets.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">
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
              <p className="text-red-500">Failed to load assets</p>
              <p className="text-sm text-slate-400">{errorMessage}</p>
            </>
          )}
          {!hasError && (
            <p className="text-slate-400">No asset data loaded. Click Update in the header to fetch from ESI.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {isRefreshingAbyssals && (
        <div className="flex items-center gap-1 text-sm text-blue-400 mb-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Fetching abyssal prices...</span>
        </div>
      )}

      <div
        ref={tableContainerRef}
        className="flex-1 min-h-0 rounded-lg border border-slate-700 overflow-auto"
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
                  draggable
                  onDragStart={(e) => handleDragStart(e, header.column.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, header.column.id)}
                  className={`sticky top-0 z-10 bg-slate-800 py-3 text-left text-sm font-medium text-slate-300 cursor-grab active:cursor-grabbing border-b border-slate-700 ${header.column.id === 'ownerName' ? 'px-2' : 'px-4'}`}
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
                return (
                  <div key={row.id} data-index={virtualRow.index} className="contents group">
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className={`py-2 text-sm border-b border-slate-700/50 group-hover:bg-slate-700/50 flex items-center ${cell.column.id === 'ownerName' ? 'px-2' : 'px-4'}`}
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
            <div className="h-24 flex items-center justify-center text-slate-400" style={{ gridColumn: `1 / -1` }}>
              No assets found.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
