import { useMemo, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { useShallow } from 'zustand/shallow'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ESIRegionOrder } from '@/api/endpoints/market'
import { useReferenceCacheStore } from '@/store/reference-cache'
import { useRegionalOrdersStore } from '@/store/regional-orders-store'
import { formatNumber, formatPrice, cn } from '@/lib/utils'
import { formatCountdown, MS_PER_DAY } from '@/lib/timer-utils'
import { PLAYER_STRUCTURE_ID_THRESHOLD } from '@/lib/eve-constants'

interface OrderDetailPanelProps {
  typeId: number | null
}

const ROW_HEIGHT = 32

function formatOrderExpiry(issued: string, durationDays: number): string {
  const expiresAt = new Date(issued).getTime() + durationDays * MS_PER_DAY
  return (
    formatCountdown(new Date(expiresAt).toISOString()) ??
    i18next.t('common:time.expired')
  )
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
  const { t } = useTranslation('tools')
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
      if (order.location_id < PLAYER_STRUCTURE_ID_THRESHOLD) {
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
          {isBuyOrder
            ? t('regionalMarket.noBuyOrders')
            : t('regionalMarket.noSellOrders')}
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
        <div>{t('regionalMarket.qty')}</div>
        <div>{t('regionalMarket.price')}</div>
        <div>{t('regionalMarket.location')}</div>
        <div className="text-right">{t('regionalMarket.expires')}</div>
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
                  {formatOrderExpiry(order.issued, order.duration)}
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
  const { t } = useTranslation('tools')
  const { regionId, loadingTypeId, error, typeOrderCache, fetchOrdersForType } =
    useRegionalOrdersStore(
      useShallow((s) => ({
        regionId: s.regionId,
        loadingTypeId: s.loadingTypeId,
        error: s.error,
        typeOrderCache: s.typeOrderCache,
        fetchOrdersForType: s.fetchOrdersForType,
      }))
    )

  useEffect(() => {
    if (typeId && regionId) {
      fetchOrdersForType(typeId)
    }
  }, [typeId, regionId, fetchOrdersForType])

  const orders = useMemo(() => {
    if (!typeId || !regionId) {
      return { sellOrders: [], buyOrders: [] }
    }
    const key = `${regionId}-${typeId}`
    const cached = typeOrderCache.get(key)
    const allOrders = cached?.orders ?? null
    if (!allOrders) {
      return { sellOrders: [], buyOrders: [] }
    }
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
  }, [typeId, regionId, typeOrderCache])

  if (!typeId) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        {t('regionalMarket.selectItemPrompt')}
      </div>
    )
  }

  if (!regionId) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        {t('regionalMarket.selectRegionPrompt')}
      </div>
    )
  }

  if (loadingTypeId === typeId) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm">
        {t('regionalMarket.loadingOrders')}
      </div>
    )
  }

  const key = `${regionId}-${typeId}`
  if (error && !typeOrderCache.has(key)) {
    return (
      <div className="h-full flex items-center justify-center text-status-negative text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <OrderTable
        orders={orders.sellOrders}
        title={t('regionalMarket.sellers')}
        isBuyOrder={false}
      />
      <OrderTable
        orders={orders.buyOrders}
        title={t('regionalMarket.buyers')}
        isBuyOrder={true}
      />
    </div>
  )
}
