import { useEffect, useRef, type ReactNode } from 'react'
import { useNotificationStore, type Notification, type NotificationType } from '@/store/toast-store'
import { useShallow } from 'zustand/react/shallow'
import { X, TrendingUp, FileCheck, Bell, AlertTriangle, Shield, Fuel, Anchor, ZapOff } from 'lucide-react'

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getNotificationIcon(type: NotificationType): ReactNode {
  switch (type) {
    case 'order-filled':
      return <TrendingUp className="h-5 w-5 text-semantic-positive" />
    case 'contract-accepted':
      return <FileCheck className="h-5 w-5 text-accent" />
    case 'structure-reinforced':
      return <AlertTriangle className="h-5 w-5 text-semantic-danger" />
    case 'structure-vulnerable':
      return <Shield className="h-5 w-5 text-semantic-warning" />
    case 'structure-low-fuel':
      return <Fuel className="h-5 w-5 text-semantic-danger" />
    case 'structure-anchoring':
      return <Anchor className="h-5 w-5 text-accent" />
    case 'structure-service-offline':
      return <ZapOff className="h-5 w-5 text-content-muted" />
    default:
      return <Bell className="h-5 w-5 text-content-secondary" />
  }
}

function NotificationItem({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const icon = getNotificationIcon(notification.type)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-tertiary p-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-content">{notification.title}</div>
        <div className="text-sm text-content-secondary truncate">{notification.message}</div>
        <div className="text-xs text-content-muted mt-1">{formatTime(notification.timestamp)}</div>
      </div>
      <button
        onClick={onDismiss}
        className="text-content-secondary hover:text-content"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { notifications, unseenCount, isPanelOpen } = useNotificationStore(
    useShallow((s) => ({
      notifications: s.notifications,
      unseenCount: s.unseenCount,
      isPanelOpen: s.isPanelOpen,
    }))
  )
  const { togglePanel, closePanel, dismissNotification, clearAll } = useNotificationStore.getState()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isPanelOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isPanelOpen, closePanel])

  return (
    <div ref={panelRef} className="fixed bottom-4 right-4 z-50">
      {isPanelOpen && (
        <div className="absolute bottom-12 right-0 w-80 rounded-lg border border-border bg-surface-secondary shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-medium text-content-secondary">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-content-secondary hover:text-content"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto p-2 space-y-2">
            {notifications.length === 0 ? (
              <div className="py-4 text-center text-sm text-content-secondary">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onDismiss={() => dismissNotification(notification.id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      <button
        onClick={togglePanel}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface-tertiary border border-border shadow-lg hover:bg-surface-tertiary/70 transition-colors"
      >
        <Bell className="h-5 w-5 text-content-secondary" />
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-medium text-accent-foreground">
            {unseenCount > 99 ? '99+' : unseenCount}
          </span>
        )}
      </button>
    </div>
  )
}
