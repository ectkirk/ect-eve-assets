import type { ModuleItem, ShipSlots } from '@/lib/fitting-utils'

interface FittingWheelProps {
  highSlotModules: ModuleItem[]
  midSlotModules: ModuleItem[]
  lowSlotModules: ModuleItem[]
  rigModules: ModuleItem[]
  subsystemModules: ModuleItem[]
  slots: ShipSlots
  shipTypeId: number
  shipName: string
}

const SLOT_POSITIONS = {
  high: [
    { x: 73, y: 60 },
    { x: 102, y: 42 },
    { x: 134, y: 27 },
    { x: 169, y: 21 },
    { x: 203, y: 22 },
    { x: 238, y: 30 },
    { x: 270, y: 45 },
    { x: 295, y: 64 },
  ],
  mid: [
    { x: 26, y: 140 },
    { x: 24, y: 176 },
    { x: 23, y: 212 },
    { x: 30, y: 245 },
    { x: 46, y: 278 },
    { x: 69, y: 304 },
    { x: 100, y: 328 },
    { x: 133, y: 342 },
  ],
  low: [
    { x: 344, y: 143 },
    { x: 350, y: 178 },
    { x: 349, y: 213 },
    { x: 340, y: 246 },
    { x: 323, y: 277 },
    { x: 300, y: 304 },
    { x: 268, y: 324 },
    { x: 234, y: 338 },
  ],
  rig: [
    { x: 148, y: 259 },
    { x: 185, y: 267 },
    { x: 221, y: 259 },
  ],
  subsystem: [
    { x: 117, y: 131 },
    { x: 147, y: 108 },
    { x: 184, y: 98 },
    { x: 221, y: 107 },
  ],
}

const PANEL_IMAGES = {
  base: '/panel/tyrannis.png',
  high: {
    1: '/panel/1h.png',
    2: '/panel/2h.png',
    3: '/panel/3h.png',
    4: '/panel/4h.png',
    5: '/panel/5h.png',
    6: '/panel/6h.png',
    7: '/panel/7h.png',
    8: '/panel/8h.png',
  } as Record<number, string>,
  mid: {
    1: '/panel/1m.png',
    2: '/panel/2m.png',
    3: '/panel/3m.png',
    4: '/panel/4m.png',
    5: '/panel/5m.png',
    6: '/panel/6m.png',
    7: '/panel/7m.png',
    8: '/panel/8m.png',
  } as Record<number, string>,
  low: {
    1: '/panel/1l.png',
    2: '/panel/2l.png',
    3: '/panel/3l.png',
    4: '/panel/4l.png',
    5: '/panel/5l.png',
    6: '/panel/6l.png',
    7: '/panel/7l.png',
    8: '/panel/8l.png',
  } as Record<number, string>,
  rig: {
    1: '/panel/1r.png',
    2: '/panel/2r.png',
    3: '/panel/3r.png',
  } as Record<number, string>,
  subsystem: {
    3: '/panel/3s.png',
    4: '/panel/4s.png',
  } as Record<number, string>,
}

const ICON_SIZE = 32

function getTypeIconUrl(typeId: number): string {
  return `https://images.evetech.net/types/${typeId}/icon?size=${ICON_SIZE}`
}

function getShipRenderUrl(typeId: number): string {
  return `https://images.evetech.net/types/${typeId}/render?size=256`
}

function SlotIcon({ module, position }: { module: ModuleItem | undefined; position: { x: number; y: number } }) {
  if (!module || !module.type_id) {
    return (
      <div
        className="absolute"
        style={{ left: position.x, top: position.y, width: ICON_SIZE, height: ICON_SIZE }}
      />
    )
  }

  return (
    <div
      className="absolute"
      style={{ left: position.x, top: position.y, width: ICON_SIZE, height: ICON_SIZE }}
    >
      <a
        href={`https://everef.net/type/${module.type_id}`}
        target="_blank"
        rel="noopener noreferrer"
        title={module.type_name}
      >
        <img
          src={getTypeIconUrl(module.type_id)}
          alt={module.type_name}
          className="rounded"
          style={{ width: ICON_SIZE, height: ICON_SIZE }}
        />
      </a>
    </div>
  )
}

function PanelLayer({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      className="absolute left-0 top-0 -z-10"
      style={{ width: 398, height: 398, border: 0 }}
    />
  )
}

export function FittingWheel({
  highSlotModules,
  midSlotModules,
  lowSlotModules,
  rigModules,
  subsystemModules,
  slots,
  shipTypeId,
  shipName,
}: FittingWheelProps) {
  return (
    <div className="relative mx-auto z-10" style={{ width: 398, height: 398 }}>
      <PanelLayer src={PANEL_IMAGES.base} />

      {slots.high > 0 && PANEL_IMAGES.high[slots.high] && (
        <PanelLayer src={PANEL_IMAGES.high[slots.high]!} />
      )}
      {slots.mid > 0 && PANEL_IMAGES.mid[slots.mid] && (
        <PanelLayer src={PANEL_IMAGES.mid[slots.mid]!} />
      )}
      {slots.low > 0 && PANEL_IMAGES.low[slots.low] && (
        <PanelLayer src={PANEL_IMAGES.low[slots.low]!} />
      )}
      {slots.rig > 0 && PANEL_IMAGES.rig[slots.rig] && (
        <PanelLayer src={PANEL_IMAGES.rig[slots.rig]!} />
      )}
      {slots.subsystem > 0 && PANEL_IMAGES.subsystem[slots.subsystem] && (
        <PanelLayer src={PANEL_IMAGES.subsystem[slots.subsystem]!} />
      )}

      <div className="absolute -z-20" style={{ left: 72, top: 71, width: 256, height: 256 }}>
        <img
          src={getShipRenderUrl(shipTypeId)}
          alt={shipName}
          className="block rounded"
          style={{ width: 256, height: 256 }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = getTypeIconUrl(shipTypeId)
          }}
        />
      </div>

      {SLOT_POSITIONS.high.slice(0, slots.high).map((pos, i) => (
        <SlotIcon key={`high-${i}`} module={highSlotModules[i]} position={pos} />
      ))}
      {SLOT_POSITIONS.mid.slice(0, slots.mid).map((pos, i) => (
        <SlotIcon key={`mid-${i}`} module={midSlotModules[i]} position={pos} />
      ))}
      {SLOT_POSITIONS.low.slice(0, slots.low).map((pos, i) => (
        <SlotIcon key={`low-${i}`} module={lowSlotModules[i]} position={pos} />
      ))}
      {SLOT_POSITIONS.rig.slice(0, slots.rig).map((pos, i) => (
        <SlotIcon key={`rig-${i}`} module={rigModules[i]} position={pos} />
      ))}
      {slots.subsystem > 0 && SLOT_POSITIONS.subsystem.slice(0, slots.subsystem).map((pos, i) => (
        <SlotIcon key={`sub-${i}`} module={subsystemModules[i]} position={pos} />
      ))}
    </div>
  )
}
