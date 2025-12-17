import { create } from 'zustand'
import { logger } from '@/lib/logger'

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
}

interface NotificationState {
  notifications: Notification[]
  unseenCount: number
  isPanelOpen: boolean
  initialized: boolean
}

interface NotificationActions {
  init: () => Promise<void>
  addNotification: (type: NotificationType, title: string, message: string) => void
  dismissNotification: (id: string) => void
  clearAll: () => void
  openPanel: () => void
  closePanel: () => void
  togglePanel: () => void
}

type NotificationStore = NotificationState & NotificationActions

const DB_NAME = 'ecteveassets-notifications'
const DB_VERSION = 1
const STORE_NAME = 'notifications'

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open notifications DB', request.error, { module: 'NotificationStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

async function loadAllFromDB(): Promise<Notification[]> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME], 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    tx.oncomplete = () => {
      const notifications = (request.result as Notification[]).sort((a, b) => a.timestamp - b.timestamp)
      resolve(notifications)
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(notification: Notification): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME], 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(notification)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteFromDB(id: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME], 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME], 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unseenCount: 0,
  isPanelOpen: false,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const notifications = await loadAllFromDB()
      set({ notifications, initialized: true, unseenCount: notifications.length })
      logger.info('Notifications loaded from cache', {
        module: 'NotificationStore',
        count: notifications.length,
      })
    } catch (err) {
      logger.error('Failed to load notifications from cache', err instanceof Error ? err : undefined, {
        module: 'NotificationStore',
      })
      set({ initialized: true })
    }
  },

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

    saveToDB(notification).catch((err) => {
      logger.error('Failed to save notification to cache', err instanceof Error ? err : undefined, {
        module: 'NotificationStore',
      })
    })
  },

  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))

    deleteFromDB(id).catch((err) => {
      logger.error('Failed to delete notification from cache', err instanceof Error ? err : undefined, {
        module: 'NotificationStore',
      })
    })
  },

  clearAll: () => {
    set({ notifications: [], unseenCount: 0 })

    clearDB().catch((err) => {
      logger.error('Failed to clear notifications cache', err instanceof Error ? err : undefined, {
        module: 'NotificationStore',
      })
    })
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
