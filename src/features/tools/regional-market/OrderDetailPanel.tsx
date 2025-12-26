import { useState, useMemo, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TypeIcon } from '@/components/ui/type-icon'
import { getRegionalOrders, type ESIRegionOrder } from '@/api/endpoints/market'
import { getTypeInfo, type ESITypeInfo } from '@/api/endpoints/universe'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { formatNumber, cn } from '@/lib/utils'
import type { CachedOrders } from './types'
import { ORDER_CACHE_TTL_MS } from './types'

interface OrderDetailPanelProps {
  regionId: number
  typeId: number | null
}

const ROW_HEIGHT = 32

function formatTimeLeft(issued: string, duration: number): string {
  const issuedDate = new Date(issued)
  const expiresDate = new Date(
    issuedDate.getTime() + duration * 24 * 60 * 60 * 1000
  )
  const now = new Date()
  const diffMs = expiresDate.getTime() - now.getTime()

  if (diffMs <= 0) return 'Expired'

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))

  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function OrderTable({
  orders,
  title,
  isBuyOrder,
}: {
  orders: ESIRegionOrder[]
  title: string
  isBuyOrder: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const systems = useReferenceCacheStore((s) => s.systems)
  const stations = useReferenceCacheStore((s) => s.stations)
  const structures = useReferenceCacheStore((s) => s.structures)

  const sortedOrders = useMemo(() => {
    const sorted = [...orders]
    if (isBuyOrder) {
      sorted.sort((a, b) => b.price - a.price)
    } else {
      sorted.sort((a, b) => a.price - b.price)
    }
    return sorted
  }, [orders, isBuyOrder])

  const virtualizer = useVirtualizer({
    count: sortedOrders.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const getLocationName = useCallback(
    (order: ESIRegionOrder): string => {
      if (order.location_id < 1_000_000_000_000) {
        const station = stations.get(order.location_id)
        if (station) return station.name
      } else {
        const structure = structures.get(order.location_id)
        if (structure) return structure.name
      }
      const system = systems.get(order.system_id)
      return system?.name ?? `System ${order.system_id}`
    },
    [systems, stations, structures]
  )

  if (orders.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-border-subtle font-medium text-sm">
          {title}
        </div>
        <div className="flex-1 flex items-center justify-center text-content-secondary text-sm">
          No {isBuyOrder ? 'buy' : 'sell'} orders
        </div>
      </div>
    )
  }

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border-subtle font-medium text-sm">
        {title} ({orders.length})
      </div>
      <div className="grid grid-cols-[1fr_80px_1fr_80px] gap-2 px-3 py-1.5 text-xs text-content-secondary border-b border-border-subtle">
        <div>Price</div>
        <div className="text-right">Quantity</div>
        <div>Location</div>
        <div className="text-right">Expires</div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualRows.map((virtualRow) => {
            const order = sortedOrders[virtualRow.index]!
            return (
              <div
                key={order.order_id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="grid grid-cols-[1fr_80px_1fr_80px] gap-2 px-3 items-center text-sm hover:bg-surface-tertiary"
              >
                <div
                  className={cn(
                    'tabular-nums font-medium truncate',
                    isBuyOrder ? 'text-status-positive' : 'text-status-negative'
                  )}
                >
                  {formatPrice(order.price)} ISK
                </div>
                <div className="text-right tabular-nums">
                  {formatNumber(order.volume_remain)}
                </div>
                <div
                  className="truncate text-content-secondary"
                  title={getLocationName(order)}
                >
                  {getLocationName(order)}
                </div>
                <div className="text-right text-content-secondary tabular-nums">
                  {formatTimeLeft(order.issued, order.duration)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface FetchState {
  loading: boolean
  error: string | null
  typeInfo: ESITypeInfo | null
  orders: CachedOrders | null
}

export function OrderDetailPanel({ regionId, typeId }: OrderDetailPanelProps) {
  const [orderCache, setOrderCache] = useState<Map<string, CachedOrders>>(
    new Map()
  )
  const [fetchState, setFetchState] = useState<FetchState>({
    loading: false,
    error: null,
    typeInfo: null,
    orders: null,
  })
  const fetchingRef = useRef<string | null>(null)

  const cachedType = useReferenceCacheStore((s) =>
    typeId ? s.types.get(typeId) : undefined
  )

  const cacheKey = typeId ? `${regionId}-${typeId}` : null
  const cached = cacheKey ? (orderCache.get(cacheKey) ?? null) : null
  const isCacheValid =
    cached && Date.now() - cached.fetchedAt < ORDER_CACHE_TTL_MS

  const fetchOrders = useCallback(async () => {
    if (!typeId || !cacheKey) return
    if (fetchingRef.current === cacheKey) return

    const existingCache = orderCache.get(cacheKey)
    if (
      existingCache &&
      Date.now() - existingCache.fetchedAt < ORDER_CACHE_TTL_MS
    ) {
      setFetchState((s) => ({ ...s, orders: existingCache }))
      return
    }

    fetchingRef.current = cacheKey
    setFetchState({ loading: true, error: null, typeInfo: null, orders: null })

    try {
      const [sellOrders, buyOrders, info] = await Promise.all([
        getRegionalOrders(regionId, typeId, 'sell'),
        getRegionalOrders(regionId, typeId, 'buy'),
        getTypeInfo(typeId),
      ])

      const newOrders: CachedOrders = {
        sellOrders,
        buyOrders,
        fetchedAt: Date.now(),
      }

      setOrderCache((prev) => {
        const next = new Map(prev)
        next.set(cacheKey, newOrders)
        return next
      })
      setFetchState({
        loading: false,
        error: null,
        typeInfo: info,
        orders: newOrders,
      })
    } catch (err) {
      setFetchState({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load orders',
        typeInfo: null,
        orders: null,
      })
    } finally {
      fetchingRef.current = null
    }
  }, [regionId, typeId, cacheKey, orderCache])

  const shouldFetch = typeId && !isCacheValid && !fetchState.loading
  if (shouldFetch && fetchingRef.current !== cacheKey) {
    fetchOrders()
  }

  if (!typeId) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        Select an item to view orders
      </div>
    )
  }

  if (fetchState.loading) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        Loading orders...
      </div>
    )
  }

  if (fetchState.error) {
    return (
      <div className="h-full flex items-center justify-center text-status-negative text-sm">
        {fetchState.error}
      </div>
    )
  }

  const orders = isCacheValid ? cached : fetchState.orders
  if (!orders) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        No order data
      </div>
    )
  }

  const typeName =
    cachedType?.name ?? fetchState.typeInfo?.name ?? `Type ${typeId}`

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-3 border-b border-border-subtle flex items-start gap-3">
        <TypeIcon
          typeId={typeId}
          categoryId={cachedType?.categoryId}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{typeName}</div>
          {fetchState.typeInfo?.description && (
            <div
              className="text-xs text-content-secondary mt-1 line-clamp-3"
              dangerouslySetInnerHTML={{
                __html: fetchState.typeInfo.description
                  .replace(/<a[^>]*>/g, '')
                  .replace(/<\/a>/g, ''),
              }}
            />
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <OrderTable
          orders={orders.sellOrders}
          title="Sellers"
          isBuyOrder={false}
        />
        <OrderTable
          orders={orders.buyOrders}
          title="Buyers"
          isBuyOrder={true}
        />
      </div>
    </div>
  )
}
