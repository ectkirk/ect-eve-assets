import { useMemo, useState, useEffect, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
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
import { useAuthStore, type Owner } from '@/store/auth-store'
import { getCharacterAssets, getAssetNames, type ESIAsset } from '@/api/endpoints/assets'
import { fetchPrices } from '@/api/ref-client'
import { fetchAbyssalPrices, isAbyssalType, hasCachedAbyssalPrice } from '@/api/mutamarket-client'
import { getAbyssalPrice } from '@/store/reference-cache'
import { getCorporationAssets } from '@/api/endpoints/corporation'
import {
  getTypeName,
  getLocationName,
  getType,
  hasType,
  hasStructure,
  hasLocation,
  subscribe as subscribeToCache,
} from '@/store/reference-cache'
import { resolveStructures, resolveLocationNames, resolveTypes } from '@/api/endpoints/universe'

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
  ownerId: number
  ownerName: string
  ownerType: 'character' | 'corporation'
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
    accessorKey: 'ownerName',
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 hover:text-slate-50"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Owner
        <ArrowUpDown className="h-4 w-4" />
      </button>
    ),
    cell: ({ row }) => {
      const ownerId = row.original.ownerId
      const name = row.getValue('ownerName') as string
      const isCorp = row.original.ownerType === 'corporation'
      return (
        <div className="flex items-center gap-2">
          <img
            src={
              isCorp
                ? `https://images.evetech.net/corporations/${ownerId}/logo?size=32`
                : `https://images.evetech.net/characters/${ownerId}/portrait?size=32`
            }
            alt=""
            className="h-5 w-5 rounded"
            loading="lazy"
          />
          <span className={isCorp ? 'text-yellow-400' : ''}>{name}</span>
        </div>
      )
    },
  },
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
      const categoryId = row.original.categoryId
      const isSkin = categoryId === 91
      const isBlueprint = categoryId === 9

      let imageUrl = `https://images.evetech.net/types/${typeId}/icon?size=32`
      if (isBlueprint) {
        imageUrl = isBpc
          ? `https://images.evetech.net/types/${typeId}/bpc?size=32`
          : `https://images.evetech.net/types/${typeId}/bp?size=32`
      }

      return (
        <div className="flex items-center gap-2">
          {!isSkin && (
            <img
              src={imageUrl}
              alt=""
              className="h-6 w-6"
              loading="lazy"
            />
          )}
          {isSkin && <div className="h-6 w-6 rounded bg-slate-700" />}
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

async function fetchOwnerAssets(owner: Owner): Promise<{ owner: Owner; assets: ESIAsset[] }> {
  let assets: ESIAsset[]
  if (owner.type === 'corporation') {
    assets = await getCorporationAssets(owner.id, owner.characterId)
  } else {
    assets = await getCharacterAssets(owner.id)
  }
  return { owner, assets }
}

export function AssetsTab() {
  const ownersRecord = useAuthStore((state) => state.owners)
  const owners = useMemo(() => Object.values(ownersRecord), [ownersRecord])

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = useState('')

  // Memoize query configs to prevent infinite re-renders
  const assetQueryConfigs = useMemo(
    () =>
      owners.map((owner) => ({
        queryKey: ['assets', owner.type, owner.id] as const,
        queryFn: () => fetchOwnerAssets(owner),
        enabled: !!(owner.accessToken || owner.refreshToken),
        staleTime: 5 * 60 * 1000,
      })),
    [owners]
  )

  const assetQueries = useQueries({ queries: assetQueryConfigs })

  const [refPrices, setRefPrices] = useState<Map<number, number> | null>(null)

  const [cacheVersion, setCacheVersion] = useState(0)
  useEffect(() => {
    return subscribeToCache(() => {
      setCacheVersion((v) => v + 1)
    })
  }, [])
  const assetDataKey = assetQueries
    .filter((q) => q.data)
    .map((q) => `${q.data!.owner.type}-${q.data!.owner.id}`)
    .sort()
    .join(',')

  const assetDataVersion = assetQueries
    .map((q) => q.dataUpdatedAt)
    .join(',')

  // Store query results in a ref to access in useMemo without dependency issues
  const assetQueriesRef = useRef(assetQueries)
  assetQueriesRef.current = assetQueries

  const assetDataList = useMemo(() => {
    void assetDataVersion
    return assetQueriesRef.current
      .filter((q) => q.data)
      .map((q) => q.data!)
  }, [assetDataVersion])

  useEffect(() => {
    if (assetDataList.length === 0) return

    const typeIds = new Set<number>()
    for (const { assets } of assetDataList) {
      for (const asset of assets) {
        typeIds.add(asset.type_id)
      }
    }

    if (typeIds.size === 0) return

    fetchPrices(Array.from(typeIds)).then(setRefPrices)
  }, [assetDataList])

  const assetDataListRef = useRef(assetDataList)
  assetDataListRef.current = assetDataList

  const ownersRef = useRef(owners)
  ownersRef.current = owners

  // Stable keys for effect dependencies (primitives don't cause size warnings)
  const ownersKey = owners.map((o) => `${o.type}-${o.id}`).sort().join(',')

  // Get all character owners for name resolution
  const characterOwners = useMemo(
    () => owners.filter((o) => o.type === 'character'),
    [owners]
  )

  // Compute name query configs with stable dependencies
  const nameQueryConfigs = useMemo(() => {
    return assetDataList
      .filter((data) => data.owner.type === 'character') // Only characters have named assets
      .flatMap((data) => {
        const singletonIds = data.assets
          .filter((a) => a.is_singleton)
          .map((a) => a.item_id)

        if (singletonIds.length === 0) return []

        return [{
          queryKey: ['assetNames', data.owner.id, singletonIds.length] as const,
          queryFn: () => getAssetNames(data.owner.id, singletonIds),
          enabled: singletonIds.length > 0,
          staleTime: 5 * 60 * 1000,
        }]
      })
  }, [assetDataList])

  // Fetch asset names for all characters
  const nameQueries = useQueries({
    queries: nameQueryConfigs,
  })

  // Track nameQueries changes using dataUpdatedAt
  const nameQueriesVersion = nameQueries
    .map((q) => q.dataUpdatedAt)
    .join(',')
  const nameQueriesRef = useRef(nameQueries)
  nameQueriesRef.current = nameQueries

  const priceMap = useMemo(() => {
    return refPrices ?? new Map<number, number>()
  }, [refPrices])

  const nameMap = useMemo(() => {
    void nameQueriesVersion
    const map = new Map<number, string>()
    for (const query of nameQueriesRef.current) {
      if (query.data) {
        for (const n of query.data) {
          if (n.name && n.name !== 'None') {
            map.set(n.item_id, n.name)
          }
        }
      }
    }
    return map
  }, [nameQueriesVersion])

  // Transform all assets to table rows
  const data = useMemo<AssetRow[]>(() => {
    void cacheVersion
    const rows: AssetRow[] = []

    // Build item_id -> asset lookup for location_type='item' (nested in container/ship)
    const itemIdToAsset = new Map<number, ESIAsset>()
    for (const { assets } of assetDataList) {
      for (const asset of assets) {
        itemIdToAsset.set(asset.item_id, asset)
      }
    }

    // Get location name based on location_type
    // Walk up parent chain until we find a station/structure/system
    const resolveLocationName = (asset: ESIAsset): string => {
      let current = asset

      // Walk up parent chain for nested items (modules in ships, items in containers)
      while (current.location_type === 'item') {
        const parent = itemIdToAsset.get(current.location_id)
        if (!parent) break
        current = parent
      }

      // Now current.location_id should be a station/structure/solar_system
      return getLocationName(current.location_id)
    }

    for (const { owner, assets } of assetDataList) {
      for (const asset of assets) {
        const sdeType = getType(asset.type_id)
        const customName = nameMap.get(asset.item_id)
        const typeName = customName || getTypeName(asset.type_id)
        const volume = sdeType?.volume ?? 0

        // Check abyssal price by item_id first (from persistent cache), then fall back to type price
        const abyssalPrice = getAbyssalPrice(asset.item_id)
        const price = abyssalPrice ?? priceMap.get(asset.type_id) ?? 0

        rows.push({
          itemId: asset.item_id,
          typeId: asset.type_id,
          typeName,
          quantity: asset.quantity,
          locationId: asset.location_id,
          locationName: resolveLocationName(asset),
          locationFlag: asset.location_flag,
          isSingleton: asset.is_singleton,
          isBlueprintCopy: asset.is_blueprint_copy ?? false,
          price,
          totalValue: price * asset.quantity,
          volume,
          totalVolume: volume * asset.quantity,
          categoryId: sdeType?.categoryId ?? 0,
          ownerId: owner.id,
          ownerName: owner.name,
          ownerType: owner.type,
        })
      }
    }

    return rows
  }, [assetDataList, priceMap, nameMap, cacheVersion])

  // Resolve unknown types via ESI /universe/types/{type_id}
  const [typeResolutionProgress, setTypeResolutionProgress] = useState<{ resolved: number; total: number } | null>(null)
  const resolvingTypesRef = useRef(false)
  useEffect(() => {
    const currentAssetData = assetDataListRef.current
    if (resolvingTypesRef.current || currentAssetData.length === 0) return

    // Collect unique type IDs that aren't cached
    const unknownTypeIds = new Set<number>()
    for (const { assets } of currentAssetData) {
      for (const asset of assets) {
        if (!hasType(asset.type_id)) {
          unknownTypeIds.add(asset.type_id)
        }
      }
    }

    if (unknownTypeIds.size === 0) return

    resolvingTypesRef.current = true
    console.log(`[Types] Resolving ${unknownTypeIds.size} unknown types via ref API...`)
    setTypeResolutionProgress({ resolved: 0, total: unknownTypeIds.size })

    resolveTypes(
      Array.from(unknownTypeIds),
      20,
      (resolved, total) => setTypeResolutionProgress({ resolved, total })
    )
      .then((resolved) => {
        if (resolved.size > 0) {
          console.log(`[Types] Resolved ${resolved.size} types`)
        }
        setTypeResolutionProgress(null)
      })
      .catch((err) => {
        console.warn('[Types] Failed to resolve:', err.message)
        setTypeResolutionProgress(null)
      })
  }, [assetDataKey])

  // Fetch abyssal module prices from Mutamarket
  const resolvingAbyssalsRef = useRef(false)
  useEffect(() => {
    const currentAssetData = assetDataListRef.current
    if (resolvingAbyssalsRef.current || currentAssetData.length === 0 || !refPrices) return

    // Find abyssal items with no price (not in persistent cache)
    const abyssalItemIds: number[] = []
    for (const { assets } of currentAssetData) {
      for (const asset of assets) {
        const typeName = getTypeName(asset.type_id)
        const hasPrice = refPrices.get(asset.type_id)

        // If it's an abyssal type with no market price and not cached, try mutamarket
        if (isAbyssalType(typeName) && !hasPrice && !hasCachedAbyssalPrice(asset.item_id)) {
          abyssalItemIds.push(asset.item_id)
        }
      }
    }

    if (abyssalItemIds.length === 0) return

    resolvingAbyssalsRef.current = true
    console.log(`[Abyssals] Fetching ${abyssalItemIds.length} prices from Mutamarket...`)

    fetchAbyssalPrices(abyssalItemIds)
      .then((prices) => {
        if (prices.size > 0) {
          console.log(`[Abyssals] Resolved ${prices.size} prices`)
          // Trigger re-render by bumping cache version (prices are in persistent cache)
          setCacheVersion((v) => v + 1)
        }
        resolvingAbyssalsRef.current = false
      })
      .catch((err) => {
        console.warn('[Abyssals] Failed to fetch prices:', err.message)
        resolvingAbyssalsRef.current = false
      })
  }, [assetDataKey, refPrices])

  // Resolve unknown structures via ESI
  // Walk up parent chain to find root location for nested items
  const resolvingStructuresRef = useRef(false)
  useEffect(() => {
    const currentAssetData = assetDataListRef.current
    const currentOwners = ownersRef.current
    if (resolvingStructuresRef.current || currentAssetData.length === 0) return

    // Build item_id -> asset lookup for walking parent chain
    const itemIdToAsset = new Map<number, ESIAsset>()
    for (const { assets } of currentAssetData) {
      for (const asset of assets) {
        itemIdToAsset.set(asset.item_id, asset)
      }
    }

    // Find root location for an asset (walk up parent chain)
    const getRootLocation = (asset: ESIAsset): { locationId: number; locationType: string } => {
      let current = asset
      while (current.location_type === 'item') {
        const parent = itemIdToAsset.get(current.location_id)
        if (!parent) break
        current = parent
      }
      return { locationId: current.location_id, locationType: current.location_type }
    }

    const unknownStructureIds = new Set<number>()
    for (const { assets } of currentAssetData) {
      for (const asset of assets) {
        const root = getRootLocation(asset)
        if (root.locationId > 1_000_000_000_000 && !hasStructure(root.locationId)) {
          unknownStructureIds.add(root.locationId)
        }
      }
    }

    if (unknownStructureIds.size === 0) {
      console.log('[Structures] No unknown structures to resolve')
      return
    }

    // Collect all character IDs to try for structure resolution
    // Each character might have different docking access
    const characterIds = currentOwners
      .map((o) => o.characterId)
      .filter((id, index, arr) => arr.indexOf(id) === index) // unique

    resolvingStructuresRef.current = true
    console.log(`[Structures] Resolving ${unknownStructureIds.size} unknown structures via ESI (trying ${characterIds.length} characters)...`)

    resolveStructures(Array.from(unknownStructureIds), characterIds)
      .then((resolved) => {
        if (resolved.size > 0) {
          console.log(`[Structures] Resolved ${resolved.size} structures`)
        }
      })
      .catch((err) => console.warn('[Structures] Failed to resolve:', err.message))
      .finally(() => {
        resolvingStructuresRef.current = false
      })
  }, [assetDataKey, ownersKey])

  // Resolve unknown location IDs via /universe/names/
  // Handles NPC stations, solar systems, regions, etc.
  const resolvingLocationsRef = useRef(false)
  useEffect(() => {
    const currentAssetData = assetDataListRef.current
    if (resolvingLocationsRef.current || currentAssetData.length === 0) return

    // Build item_id -> asset lookup for walking parent chain
    const itemIdToAsset = new Map<number, ESIAsset>()
    for (const { assets } of currentAssetData) {
      for (const asset of assets) {
        itemIdToAsset.set(asset.item_id, asset)
      }
    }

    // Find root location for an asset (walk up parent chain)
    const getRootLocationId = (asset: ESIAsset): number => {
      let current = asset
      while (current.location_type === 'item') {
        const parent = itemIdToAsset.get(current.location_id)
        if (!parent) break
        current = parent
      }
      return current.location_id
    }

    // Collect unknown location IDs (not structures, not already cached)
    const unknownLocationIds = new Set<number>()
    for (const { assets } of currentAssetData) {
      for (const asset of assets) {
        const rootLocationId = getRootLocationId(asset)
        if (rootLocationId > 1_000_000_000_000) continue
        if (hasLocation(rootLocationId)) continue
        unknownLocationIds.add(rootLocationId)
      }
    }

    if (unknownLocationIds.size === 0) return

    resolvingLocationsRef.current = true
    console.log(`[Locations] Resolving ${unknownLocationIds.size} unknown locations...`)

    resolveLocationNames(Array.from(unknownLocationIds))
      .then((resolved) => {
        if (resolved.size > 0) {
          console.log(`[Locations] Resolved ${resolved.size} locations`)
        }
      })
      .catch((err) => console.warn('[Locations] Failed to resolve:', err.message))
      .finally(() => {
        resolvingLocationsRef.current = false
      })
  }, [assetDataKey])

  const totals = useMemo(() => {
    let totalValue = 0
    let totalVolume = 0
    let totalItems = 0

    for (const row of data) {
      totalValue += row.totalValue
      totalVolume += row.totalVolume
      totalItems += row.quantity
    }

    return { totalValue, totalVolume, totalItems }
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

  const isLoading = assetQueries.some((q) => q.isLoading)
  const hasError = assetQueries.some((q) => q.error)
  const firstError = assetQueries.find((q) => q.error)?.error

  if (owners.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-slate-400">No characters logged in. Add a character to view assets.</p>
      </div>
    )
  }

  if (isLoading && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-400">Loading assets...</span>
      </div>
    )
  }

  if (typeResolutionProgress && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
          <p className="mt-2 text-slate-400">
            Resolving item types from ESI...
          </p>
          <p className="text-sm text-slate-500">
            {typeResolutionProgress.resolved} / {typeResolutionProgress.total}
          </p>
        </div>
      </div>
    )
  }

  if (hasError && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500">Failed to load assets</p>
          <p className="text-sm text-slate-400">
            {firstError instanceof Error ? firstError.message : 'Unknown error'}
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
            <span className="text-slate-400">Owners: </span>
            <span className="font-medium">{owners.length}</span>
            <span className="text-slate-500 text-xs ml-1">
              ({characterOwners.length} char, {owners.length - characterOwners.length} corp)
            </span>
          </div>
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
          {isLoading && (
            <div className="flex items-center gap-1 text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Refreshing...</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {refPrices ? `${refPrices.size} prices loaded` : 'Loading prices...'}
          </span>
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
