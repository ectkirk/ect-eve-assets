import { memo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { HoveredSystem } from '../types'
import { formatSecurity } from '@/lib/utils'
import { CorruptionBadge } from './MapInsurgencyPanel'

interface TooltipListProps {
  label: string
  items: string[]
  maxVisible?: number
  moreText: string
}

function TooltipList({
  label,
  items,
  maxVisible = 5,
  moreText,
}: TooltipListProps) {
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
          <li className="text-content-secondary">{moreText}</li>
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
  const { t } = useTranslation('tools')
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

  const stationMoreCount =
    (system.stationNames?.length ?? 0) > 5
      ? (system.stationNames?.length ?? 0) - 5
      : 0

  return (
    <div
      ref={measureRef}
      className="pointer-events-none absolute z-40 rounded border border-border-secondary bg-surface-secondary px-3 py-2 shadow-lg"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        minWidth: `${TOOLTIP_WIDTH}px`,
      }}
    >
      <div className="text-sm font-semibold text-content">{system.name}</div>
      <div className="text-xs text-content-secondary">
        {t('map.security')}:{' '}
        <span
          className={`text-sec-${Math.max(0, Math.min(10, Math.round(system.security * 10)))}`}
        >
          {formatSecurity(system.security)}
        </span>
      </div>
      {system.regionName && (
        <div className="mt-1 text-xs text-accent">
          {t('map.regionLabel')}: {system.regionName}
        </div>
      )}
      {system.factionName && (
        <div className="mt-1 text-xs text-purple-400">
          {t('map.faction')}: {system.factionName}
        </div>
      )}
      {system.allianceName && (
        <div className="mt-1 text-xs text-green-400">
          {t('map.sovereignty')}: {system.allianceName}
        </div>
      )}
      {system.isIncursion && (
        <div className="mt-1 text-xs text-semantic-danger">
          {t('map.incursion')}
        </div>
      )}
      {system.corruptionLevel !== undefined && (
        <div className="mt-1 flex items-center gap-1 text-xs text-semantic-warning">
          {t('map.insurgency')} <CorruptionBadge level={system.corruptionLevel} />
        </div>
      )}
      {system.stationNames && (
        <TooltipList
          label={t('map.stations')}
          items={system.stationNames}
          moreText={t('map.more', { count: stationMoreCount })}
        />
      )}
    </div>
  )
})
