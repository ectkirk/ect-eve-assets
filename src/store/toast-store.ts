import { create } from 'zustand'
import { logger } from '@/lib/logger'
import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbDelete,
  idbClear,
} from '@/lib/idb-utils'
import { useStoreRegistry } from '@/store/store-registry'

export type NotificationType =
  | 'order-filled'
  | 'contract-accepted'
  | 'structure-reinforced'
  | 'structure-vulnerable'
  | 'structure-low-fuel'
  | 'structure-anchoring'
  | 'structure-service-offline'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: number
  entityId?: number
  eventKey?: string
  seen?: boolean
}

interface NotificationState {
  notifications: Notification[]
  unseenCount: number
  isPanelOpen: boolean
  initialized: boolean
}

interface NotificationActions {
  init: () => Promise<void>
  addNotification: (
    type: NotificationType,
    title: string,
    message: string,
    entityId?: number,
    eventKey?: string
  ) => void
  dismissNotification: (id: string) => void
  clearAll: () => void
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
  getNotifiedKeys: () => Set<string>
}

type NotificationStore = NotificationState & NotificationActions

const DB_CONFIG = {
  dbName: 'ecteveassets-notifications',
  version: 1,
  stores: [{ name: 'notifications', keyPath: 'id' }],
  module: 'NotificationStore',
}

async function getDB() {
  return openDatabase(DB_CONFIG)
}

let initPromise: Promise<void> | null = null

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unseenCount: 0,
  isPanelOpen: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        const db = await getDB()
        const loaded = await idbGetAll<Notification>(db, 'notifications')
        const notifications = loaded.sort((a, b) => a.timestamp - b.timestamp)
        const unseenCount = notifications.filter((n) => !n.seen).length
        set({ notifications, initialized: true, unseenCount })
        logger.info('Notifications loaded from cache', {
          module: 'NotificationStore',
          count: notifications.length,
          unseen: unseenCount,
        })
      } catch (err) {
        logger.error(
          'Failed to load notifications from cache',
          err instanceof Error ? err : undefined,
          {
            module: 'NotificationStore',
          }
        )
        set({ initialized: true })
      }
    })()

    return initPromise
  },

  addNotification: (type, title, message, entityId, eventKey) => {
    const notification: Notification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
      entityId,
      eventKey,
    }
    set((state) => ({
      notifications: [...state.notifications, notification],
      unseenCount: state.isPanelOpen
        ? state.unseenCount
        : state.unseenCount + 1,
    }))

    getDB()
      .then((db) => idbPut(db, 'notifications', notification))
      .catch((err) => {
        logger.error(
          'Failed to save notification to cache',
          err instanceof Error ? err : undefined,
          { module: 'NotificationStore' }
        )
      })
  },

  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))

    getDB()
      .then((db) => idbDelete(db, 'notifications', id))
      .catch((err) => {
        logger.error(
          'Failed to delete notification from cache',
          err instanceof Error ? err : undefined,
          { module: 'NotificationStore' }
        )
      })
  },

  clearAll: () => {
    initPromise = null
    set({ notifications: [], unseenCount: 0, initialized: false })

    getDB()
      .then((db) => idbClear(db, 'notifications'))
      .catch((err) => {
        logger.error(
          'Failed to clear notifications cache',
          err instanceof Error ? err : undefined,
          { module: 'NotificationStore' }
        )
      })
  },

  openPanel: () => {
    const { notifications } = get()
    const toUpdate: Notification[] = []
    const updated = notifications.map((n) => {
      if (n.seen) return n
      const marked = { ...n, seen: true }
      toUpdate.push(marked)
      return marked
    })
    set({ isPanelOpen: true, unseenCount: 0, notifications: updated })

    getDB()
      .then(async (db) => {
        for (const notification of toUpdate) {
          await idbPut(db, 'notifications', notification)
        }
      })
      .catch((err) => {
        logger.error(
          'Failed to update notification seen state',
          err instanceof Error ? err : undefined,
          { module: 'NotificationStore' }
        )
      })
  },

  closePanel: () => {
    set({ isPanelOpen: false })
  },

  togglePanel: () => {
    const { isPanelOpen } = get()
    if (isPanelOpen) {
      get().closePanel()
    } else {
      get().openPanel()
    }
  },

  getNotifiedKeys: () => {
    const keys = new Set<string>()
    for (const notification of get().notifications) {
      if (notification.entityId !== undefined && notification.eventKey) {
        keys.add(`${notification.entityId}:${notification.eventKey}`)
      }
    }
    return keys
  },
}))

// Backwards compatibility
export const useToastStore = {
  getState: () => {
    const state = useNotificationStore.getState()
    return {
      ...state,
      toasts: state.notifications,
      addToast: (type: NotificationType, title: string, message: string) =>
        state.addNotification(type, title, message),
      dismissToast: state.dismissNotification,
    }
  },
}
export type Toast = Notification
export type ToastType = NotificationType

useStoreRegistry.getState().register({
  name: 'notifications',
  clear: async () => useNotificationStore.getState().clearAll(),
  getIsUpdating: () => false,
  init: useNotificationStore.getState().init,
})
