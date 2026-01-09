import { type ReactNode } from 'react'
import { IngameActionModal } from '@/components/dialogs/IngameActionModal'
import { useSystemContextMenu } from '../hooks/useSystemContextMenu'
import { MapSystemContextMenu } from './MapSystemContextMenu'

interface MapEventPanelProps {
  title: string
  count: number
  countColorClass: string
  position: 'right-4' | 'right-64'
  isIgnored: (systemId: number) => boolean
  onSetOrigin: (systemId: number) => void
  onSetDestination: (systemId: number) => void
  onIgnore: (systemId: number) => void
  onUnignore: (systemId: number) => void
  children: (
    openContextMenu: (
      e: React.MouseEvent,
      systemId: number,
      systemName: string
    ) => void
  ) => ReactNode
}

export function MapEventPanel({
  title,
  count,
  countColorClass,
  position,
  isIgnored,
  onSetOrigin,
  onSetDestination,
  onIgnore,
  onUnignore,
  children,
}: MapEventPanelProps) {
  const { contextMenuProps, waypointModalProps, openContextMenu } =
    useSystemContextMenu({
      isIgnored,
      onSetOrigin,
      onSetDestination,
      onIgnore,
      onUnignore,
    })

  if (count === 0) return null

  return (
    <div
      className={`absolute bottom-4 ${position} max-h-[40vh] w-56 overflow-hidden rounded-lg border border-border-secondary bg-surface-secondary shadow-lg`}
    >
      <div className="border-b border-border-secondary px-3 py-2">
        <span className="text-sm font-medium text-content-primary">
          {title}
        </span>
        <span className={`ml-2 text-xs ${countColorClass}`}>({count})</span>
      </div>
      <div className="max-h-[35vh] overflow-y-auto px-3 py-2">
        {children(openContextMenu)}
      </div>

      {contextMenuProps && <MapSystemContextMenu {...contextMenuProps} />}
      <IngameActionModal {...waypointModalProps} />
    </div>
  )
}
