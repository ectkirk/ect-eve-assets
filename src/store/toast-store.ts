import { create } from 'zustand'

export type NotificationType = 'order-filled' | 'contract-accepted'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: number
}

interface NotificationState {
  notifications: Notification[]
  unseenCount: number
  isPanelOpen: boolean
}

interface NotificationActions {
  addNotification: (type: NotificationType, title: string, message: string) => void
  dismissNotification: (id: string) => void
  clearAll: () => void
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
}

type NotificationStore = NotificationState & NotificationActions

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unseenCount: 0,
  isPanelOpen: false,

  addNotification: (type, title, message) => {
    const notification: Notification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
    }
    set((state) => ({
      notifications: [...state.notifications, notification],
      unseenCount: state.isPanelOpen ? state.unseenCount : state.unseenCount + 1,
    }))
  },

  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },

  clearAll: () => {
    set({ notifications: [], unseenCount: 0 })
  },

  openPanel: () => {
    set({ isPanelOpen: true, unseenCount: 0 })
  },

  closePanel: () => {
    set({ isPanelOpen: false })
  },

  togglePanel: () => {
    const { isPanelOpen } = get()
    if (isPanelOpen) {
      set({ isPanelOpen: false })
    } else {
      set({ isPanelOpen: true, unseenCount: 0 })
    }
  },
}))

// Backwards compatibility
export const useToastStore = {
  getState: () => {
    const state = useNotificationStore.getState()
    return {
      ...state,
      toasts: state.notifications,
      addToast: state.addNotification,
      dismissToast: state.dismissNotification,
    }
  },
}
export type Toast = Notification
export type ToastType = NotificationType
