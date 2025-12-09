import { useMemo, useState, useEffect, useRef } from 'react'
import { useQueries } from '@tanstack/react-query'
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
import { ArrowUpDown, Check, ChevronDown, Loader2, X } from 'lucide-react'
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
import { fetchAbyssalPrices, isAbyssalTypeId, hasCachedAbyssalPrice } from '@/api/mutamarket-client'
import { getAbyssalPrice } from '@/store/reference-cache'
import { getCorporationAssets } from '@/api/endpoints/corporation'
import {
  getTypeName,
  getType,
  getStructure,
  getLocation,
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

function loadColumnVisibility(): VisibilityState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_VISIBILITY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
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
    header: () => <span className="sr-only">Owner</span>,
    cell: ({ row }) => {
      const ownerId = row.original.ownerId
      const name = row.getValue('ownerName') as string
      const isCorp = row.original.ownerType === 'corporation'
      return (
        <img
          src={
            isCorp
              ? `https://images.evetech.net/corporations/${ownerId}/logo?size=32`
              : `https://images.evetech.net/characters/${ownerId}/portrait?size=32`
          }
          alt={name}
          title={name}
          className="h-6 w-6 rounded"
          loading="lazy"
        />
      )
    },
  },
  {
    accessorKey: 'typeName',
    size: 280,
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
        <span className="tabular-nums text-right block">
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
        <span className="tabular-nums text-right block text-green-400">
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
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility)
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(loadColumnOrder)
  const [globalFilter, setGlobalFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [columnsDropdownOpen, setColumnsDropdownOpen] = useState(false)
  const columnsDropdownRef = useRef<HTMLDivElement>(null)
  const draggedColumnRef = useRef<string | null>(null)

  // Persist column visibility changes
  useEffect(() => {
    saveColumnVisibility(columnVisibility)
  }, [columnVisibility])

  // Persist column order changes
  useEffect(() => {
    saveColumnOrder(columnOrder)
  }, [columnOrder])

  // Close dropdown on click outside
  useEffect(() => {
    if (!columnsDropdownOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(e.target as Node)) {
        setColumnsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [columnsDropdownOpen])

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

      if (current.location_type === 'solar_system' && current.item_id > 1_000_000_000_000) {
        // Asset is a structure itself (e.g., ship in space)
        // Structure comes from ESI, system/region from ref API
        const structure = getStructure(current.item_id)
        locationName = structure?.name ?? `Structure ${current.item_id}`
        if (structure?.solarSystemId) {
          const system = getLocation(structure.solarSystemId)
          systemName = system?.name ?? ''
          regionName = system?.regionName ?? ''
        }
      } else if (current.location_id > 1_000_000_000_000) {
        // Player structure from ESI, system/region from ref API
        const structure = getStructure(current.location_id)
        locationName = structure?.name ?? `Structure ${current.location_id}`
        if (structure?.solarSystemId) {
          const system = getLocation(structure.solarSystemId)
          systemName = system?.name ?? ''
          regionName = system?.regionName ?? ''
        }
      } else {
        // NPC station or other location - now with system/region from ref API
        const location = getLocation(current.location_id)
        locationName = location?.name ?? `Location ${current.location_id}`
        systemName = location?.solarSystemName ?? ''
        regionName = location?.regionName ?? ''
      }

      return { locationName, systemName, regionName }
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

    return rows
  }, [assetDataList, priceMap, nameMap, cacheVersion])

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const row of data) {
      if (row.categoryName) cats.add(row.categoryName)
    }
    return Array.from(cats).sort()
  }, [data])

  const filteredData = useMemo(() => {
    const searchLower = globalFilter.toLowerCase()
    return data.filter((row) => {
      if (categoryFilter && row.categoryName !== categoryFilter) return false
      if (globalFilter) {
        const matchesType = row.typeName.toLowerCase().includes(searchLower)
        const matchesGroup = row.groupName.toLowerCase().includes(searchLower)
        const matchesLocation = row.locationName.toLowerCase().includes(searchLower)
        const matchesSystem = row.systemName.toLowerCase().includes(searchLower)
        const matchesRegion = row.regionName.toLowerCase().includes(searchLower)
        if (!matchesType && !matchesGroup && !matchesLocation && !matchesSystem && !matchesRegion) return false
      }
      return true
    })
  }, [data, categoryFilter, globalFilter])

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

  // Fetch abyssal module prices from Mutamarket (manual action via Data menu)
  const [isRefreshingAbyssals, setIsRefreshingAbyssals] = useState(false)
  const refreshAbyssalPricesRef = useRef<() => Promise<void>>(null!)

  refreshAbyssalPricesRef.current = async () => {
    if (isRefreshingAbyssals || assetDataList.length === 0) return

    const abyssalItemIds: number[] = []
    for (const { assets } of assetDataList) {
      for (const asset of assets) {
        if (isAbyssalTypeId(asset.type_id) && !hasCachedAbyssalPrice(asset.item_id)) {
          abyssalItemIds.push(asset.item_id)
        }
      }
    }

    if (abyssalItemIds.length === 0) {
      console.log('[Abyssals] No uncached abyssal items to fetch')
      return
    }

    setIsRefreshingAbyssals(true)
    console.log(`[Abyssals] Fetching ${abyssalItemIds.length} prices from Mutamarket...`)

    try {
      const prices = await fetchAbyssalPrices(abyssalItemIds)
      if (prices.size > 0) {
        console.log(`[Abyssals] Resolved ${prices.size} prices`)
        setCacheVersion((v) => v + 1)
      }
    } catch (err) {
      console.warn('[Abyssals] Failed to fetch prices:', err instanceof Error ? err.message : err)
    } finally {
      setIsRefreshingAbyssals(false)
    }
  }

  // Listen for Data menu "Refresh Abyssal Prices" command
  useEffect(() => {
    const handler = () => {
      refreshAbyssalPricesRef.current?.()
    }
    window.addEventListener('refreshAbyssalPrices', handler)
    return () => window.removeEventListener('refreshAbyssalPrices', handler)
  }, [])

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
        if (asset.location_type === 'solar_system' && asset.item_id > 1_000_000_000_000) {
          if (!hasStructure(asset.item_id)) {
            unknownStructureIds.add(asset.item_id)
          }
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

  // Resolve unknown location IDs via ref API /universe
  // Handles NPC stations, solar systems (for structures), regions, etc.
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
        if (rootLocationId > 1_000_000_000_000) {
          // Player structure - check if we need to resolve its solar system
          const structure = getStructure(rootLocationId)
          if (structure?.solarSystemId && !hasLocation(structure.solarSystemId)) {
            unknownLocationIds.add(structure.solarSystemId)
          }
        } else if (!hasLocation(rootLocationId)) {
          // NPC station or other location
          unknownLocationIds.add(rootLocationId)
        }
      }
    }

    if (unknownLocationIds.size === 0) return

    resolvingLocationsRef.current = true
    console.log(`[Locations] Resolving ${unknownLocationIds.size} unknown locations via ref API...`)

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
  }, [assetDataKey, cacheVersion])

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
    estimateSize: () => 41, // Estimated row height in pixels
    overscan: 10,
  })

  const filteredRows = table.getFilteredRowModel().rows
  const totals = useMemo(() => {
    let totalValue = 0
    let totalVolume = 0
    let totalItems = 0

    for (const row of filteredRows) {
      totalValue += row.original.totalValue
      totalVolume += row.original.totalVolume
      totalItems += row.original.quantity
    }

    return { totalValue, totalVolume, totalItems }
  }, [filteredRows])

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
          {isRefreshingAbyssals && (
            <div className="flex items-center gap-1 text-xs text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Fetching abyssal prices...</span>
            </div>
          )}
          <div className="relative" ref={columnsDropdownRef}>
            <button
              onClick={() => setColumnsDropdownOpen(!columnsDropdownOpen)}
              className="flex items-center gap-1 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
            >
              Columns <ChevronDown className="h-4 w-4" />
            </button>
            {columnsDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded border border-slate-600 bg-slate-800 py-1 shadow-lg">
                {table.getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <button
                      key={column.id}
                      onClick={() => column.toggleVisibility(!column.getIsVisible())}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-700"
                    >
                      <span className="flex h-4 w-4 items-center justify-center">
                        {column.getIsVisible() && <Check className="h-4 w-4 text-blue-400" />}
                      </span>
                      {COLUMN_LABELS[column.id] ?? column.id}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="text"
            placeholder="Search name, group, station, system, region..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-72 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 pr-8 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none"
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="w-40 rounded border border-slate-600 bg-slate-700 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <span className="text-sm text-slate-400">
          Showing {filteredRows.length} of {data.length} assets
        </span>
      </div>

      {/* Table with Virtual Scrolling */}
      <div
        ref={tableContainerRef}
        className="rounded-lg border border-slate-700 overflow-auto"
        style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}
      >
        <Table style={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHeader className="sticky top-0 z-10 bg-slate-800">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-800 hover:bg-slate-800">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, header.column.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, header.column.id)}
                    className="cursor-grab active:cursor-grabbing"
                    style={{ width: header.getSize(), minWidth: header.getSize() }}
                  >
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
            {rows.length ? (
              <>
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{ height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0 }}
                    />
                  </tr>
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  if (!row) return null
                  return (
                    <TableRow key={row.id} data-index={virtualRow.index}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      style={{
                        height:
                          rowVirtualizer.getTotalSize() -
                          (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                      }}
                    />
                  </tr>
                )}
              </>
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
    </div>
  )
}
