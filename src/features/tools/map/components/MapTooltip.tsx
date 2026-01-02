import { memo, useState, useCallback } from 'react'
import type { HoveredSystem } from '../types'
import { roundSecurity } from '../utils/colors'

interface TooltipListProps {
  label: string
  items: string[]
  maxVisible?: number
}

function TooltipList({ label, items, maxVisible = 5 }: TooltipListProps) {
  if (items.length === 0) return null

  return (
    <div className="mt-1 border-t border-border-secondary pt-1">
      <div className="text-xs text-content-secondary">
        {label} ({items.length})
      </div>
      <ul className="mt-0.5 space-y-0.5 text-xs text-content">
        {items.slice(0, maxVisible).map((name) => (
          <li key={name} className="truncate">
            {name}
          </li>
        ))}
        {items.length > maxVisible && (
          <li className="text-content-secondary">
            +{items.length - maxVisible} more
          </li>
        )}
      </ul>
    </div>
  )
}

interface MapTooltipProps {
  system: HoveredSystem
  containerWidth?: number
  containerHeight?: number
}

const TOOLTIP_OFFSET = 15
const VIEWPORT_MARGIN = 8
const TOOLTIP_WIDTH = 220
const TOOLTIP_HEIGHT_ESTIMATE = 150

export const MapTooltip = memo(function MapTooltip({
  system,
  containerWidth = 1200,
  containerHeight = 800,
}: MapTooltipProps) {
  const [measuredHeight, setMeasuredHeight] = useState(TOOLTIP_HEIGHT_ESTIMATE)

  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setMeasuredHeight(node.offsetHeight)
    }
  }, [])

  const tooltipHeight = measuredHeight
  const maxX = containerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN
  const maxY = containerHeight - tooltipHeight - VIEWPORT_MARGIN

  let left = system.screenX + TOOLTIP_OFFSET
  let top = system.screenY + TOOLTIP_OFFSET

  if (left > maxX) {
    left = system.screenX - TOOLTIP_WIDTH - TOOLTIP_OFFSET
  }
  if (top > maxY) {
    top = system.screenY - tooltipHeight - TOOLTIP_OFFSET
  }

  left = Math.max(VIEWPORT_MARGIN, left)
  top = Math.max(VIEWPORT_MARGIN, top)

  return (
    <div
      ref={measureRef}
      className="pointer-events-none absolute z-20 rounded border border-border-secondary bg-surface-secondary px-3 py-2 shadow-lg"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        minWidth: `${TOOLTIP_WIDTH}px`,
      }}
    >
      <div className="text-sm font-semibold text-content">{system.name}</div>
      <div className="text-xs text-content-secondary">
        Security:{' '}
        <span
          className={`text-sec-${Math.max(0, Math.min(10, Math.round(system.security * 10)))}`}
        >
          {roundSecurity(system.security).toFixed(1)}
        </span>
      </div>
      {system.regionName && (
        <div className="mt-1 text-xs text-accent">
          Region: {system.regionName}
        </div>
      )}
      {system.factionName && (
        <div className="mt-1 text-xs text-purple-400">
          Faction: {system.factionName}
        </div>
      )}
      {system.allianceName && (
        <div className="mt-1 text-xs text-green-400">
          Sovereignty: {system.allianceName}
        </div>
      )}
      {system.stationNames && (
        <TooltipList label="Stations" items={system.stationNames} />
      )}
      {system.structureNames && (
        <TooltipList label="Structures" items={system.structureNames} />
      )}
    </div>
  )
})
