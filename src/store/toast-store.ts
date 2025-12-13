import { create } from 'zustand'

export type ToastType = 'order-filled' | 'contract-accepted'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message: string
  timestamp: number
}

interface ToastState {
  toasts: Toast[]
}

interface ToastActions {
  addToast: (type: ToastType, title: string, message: string) => void
  dismissToast: (id: string) => void
  clearAll: () => void
}

type ToastStore = ToastState & ToastActions

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (type, title, message) => {
    const toast: Toast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type,
      title,
      message,
      timestamp: Date.now(),
    }
    set((state) => ({ toasts: [...state.toasts, toast] }))
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },

  clearAll: () => {
    set({ toasts: [] })
  },
}))
