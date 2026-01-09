import { useState, useEffect, useCallback } from 'react'

interface ContextMenuState {
  x: number
  y: number
  systemId: number
  systemName: string
}

interface WaypointActionState {
  systemId: number
  systemName: string
}

interface UseSystemContextMenuOptions {
  isIgnored: (systemId: number) => boolean
  onSetOrigin: (systemId: number) => void
  onSetDestination: (systemId: number) => void
  onIgnore: (systemId: number) => void
  onUnignore: (systemId: number) => void
}

export function useSystemContextMenu(options: UseSystemContextMenuOptions) {
  const { isIgnored, onSetOrigin, onSetDestination, onIgnore, onUnignore } =
    options

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [waypointAction, setWaypointAction] =
    useState<WaypointActionState | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  const openContextMenu = useCallback(
    (e: React.MouseEvent, systemId: number, systemName: string) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, systemId, systemName })
    },
    []
  )

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const closeWaypointModal = useCallback(
    (open: boolean) => !open && setWaypointAction(null),
    []
  )

  const contextMenuProps = contextMenu
    ? {
        x: contextMenu.x,
        y: contextMenu.y,
        isIgnored: isIgnored(contextMenu.systemId),
        onSetOrigin: () => {
          onSetOrigin(contextMenu.systemId)
          setContextMenu(null)
        },
        onSetDestination: () => {
          onSetDestination(contextMenu.systemId)
          setContextMenu(null)
        },
        onIgnore: () => {
          onIgnore(contextMenu.systemId)
          setContextMenu(null)
        },
        onUnignore: () => {
          onUnignore(contextMenu.systemId)
          setContextMenu(null)
        },
        onSetWaypoint: () => {
          setWaypointAction({
            systemId: contextMenu.systemId,
            systemName: contextMenu.systemName,
          })
          setContextMenu(null)
        },
        onClose: closeContextMenu,
      }
    : null

  const waypointModalProps = {
    open: waypointAction !== null,
    onOpenChange: closeWaypointModal,
    action: 'autopilot' as const,
    targetId: waypointAction?.systemId ?? 0,
    targetName: waypointAction?.systemName,
  }

  return {
    contextMenu,
    contextMenuProps,
    waypointModalProps,
    openContextMenu,
    closeContextMenu,
  }
}
