import { useMemo, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ESIRegionOrder } from '@/api/endpoints/market'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { useRegionalOrdersStore } from '@/store/regional-orders-store'
import { formatNumber, cn } from '@/lib/utils'

interface OrderDetailPanelProps {
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
      <div className="flex-1 flex flex-col min-h-0 m-3 rounded-lg border border-border bg-surface-secondary/30">
        <div className="px-4 py-2 font-medium text-sm bg-surface-secondary border-b border-border">
          {title}
        </div>
        <div className="flex-1 flex items-center justify-center text-content-tertiary text-sm py-8">
          No {isBuyOrder ? 'buy' : 'sell'} orders
        </div>
      </div>
    )
  }

  const virtualRows = virtualizer.getVirtualItems()

  return (
    <div className="flex-1 flex flex-col min-h-0 m-3 rounded-lg border border-border bg-surface-secondary/30 overflow-hidden">
      <div className="px-4 py-2 font-medium text-sm bg-surface-secondary border-b border-border">
        {title} ({orders.length})
      </div>
      <div className="grid grid-cols-[80px_1fr_1fr_80px] gap-2 px-4 py-2 text-xs text-content-secondary bg-surface-secondary border-b border-border">
        <div>Qty</div>
        <div>Price</div>
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
            const locationName = getLocationName(order)
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
                className="grid grid-cols-[80px_1fr_1fr_80px] gap-2 px-4 items-center text-sm border-b border-border/50 hover:bg-surface-tertiary/50"
              >
                <div className="tabular-nums">
                  {formatNumber(order.volume_remain)}
                </div>
                <div
                  className={cn(
                    'tabular-nums',
                    isBuyOrder ? 'text-status-positive' : 'text-status-negative'
                  )}
                >
                  {formatPrice(order.price)}
                </div>
                <div
                  className="truncate text-content-secondary"
                  title={locationName}
                >
                  {locationName}
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

export function OrderDetailPanel({ typeId }: OrderDetailPanelProps) {
  const status = useRegionalOrdersStore((s) => s.status)
  const error = useRegionalOrdersStore((s) => s.error)
  const getOrdersForType = useRegionalOrdersStore((s) => s.getOrdersForType)

  const orders = useMemo(() => {
    if (!typeId) return { sellOrders: [], buyOrders: [] }
    const allOrders = getOrdersForType(typeId)
    const sellOrders: ESIRegionOrder[] = []
    const buyOrders: ESIRegionOrder[] = []
    for (const order of allOrders) {
      if (order.is_buy_order) {
        buyOrders.push(order)
      } else {
        sellOrders.push(order)
      }
    }
    return { sellOrders, buyOrders }
  }, [typeId, getOrdersForType])

  if (!typeId) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        Select an item to view orders
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        Loading region orders...
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="h-full flex items-center justify-center text-status-negative text-sm">
        {error ?? 'Failed to load orders'}
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        Select a region to load market data
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <OrderTable
        orders={orders.sellOrders}
        title="Sellers"
        isBuyOrder={false}
      />
      <OrderTable orders={orders.buyOrders} title="Buyers" isBuyOrder={true} />
    </div>
  )
}
