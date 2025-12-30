import { useMemo } from 'react'
import { FittingWheel } from '@/components/FittingWheel'
import { ShipStatsPanel, FittingStats } from './ShipStatsPanel'
import { extractShipSlots, buildAttrMap } from './ship-stat-utils'

interface ShipFittingLayoutProps {
  data: {
    type: {
      _key: number
      name: { en: string }
    }
    dogma?: {
      attributes?: Array<{ attributeID: number; value: number }>
      attributeDefinitions?: Record<
        string,
        {
          name: string
          displayName: string | null
          unitId: number | null
          categoryId: number | null
          published: boolean
        }
      >
      computedAttributes?: Record<string, number | null>
    }
  }
}

export function ShipFittingLayout({ data }: ShipFittingLayoutProps) {
  const attrMap = useMemo(
    () => buildAttrMap(data.dogma?.attributes),
    [data.dogma?.attributes]
  )

  const slots = useMemo(() => extractShipSlots(attrMap), [attrMap])

  const type = data.type
  if (!type) return null

  const hasAnySlots =
    slots.high > 0 ||
    slots.mid > 0 ||
    slots.low > 0 ||
    slots.rig > 0 ||
    slots.subsystem > 0

  if (!hasAnySlots && !data.dogma?.attributes?.length) return null

  return (
    <section className="rounded-lg border border-border bg-surface-secondary p-4">
      <h3 className="mb-4 font-semibold text-content">Ship Fitting</h3>
      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-start">
        {hasAnySlots && (
          <div className="shrink-0">
            <FittingWheel
              highSlotModules={[]}
              midSlotModules={[]}
              lowSlotModules={[]}
              rigModules={[]}
              subsystemModules={[]}
              slots={slots}
              shipTypeId={type._key}
              shipName={type.name.en}
            />
            <FittingStats attrMap={attrMap} />
          </div>
        )}
        <div className="w-full min-w-0 flex-1">
          <ShipStatsPanel attrMap={attrMap} hideFitting />
        </div>
      </div>
    </section>
  )
}
