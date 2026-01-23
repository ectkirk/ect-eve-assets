import { X } from 'lucide-react'
import { useToastStore, type ToastType } from '@/store/toast-store'
import { cn } from '@/lib/utils'

const typeStyles: Record<ToastType, string> = {
  success: 'bg-status-positive/20 border-status-positive text-status-positive',
  error: 'bg-status-negative/20 border-status-negative text-status-negative',
  info: 'bg-accent/20 border-accent text-accent',
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-2 rounded-md border px-4 py-2 text-sm shadow-lg backdrop-blur-sm',
            typeStyles[toast.type]
          )}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="rounded p-0.5 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
