import { useToastStore, type Toast } from '@/store/toast-store'
import { X, TrendingUp, FileCheck } from 'lucide-react'

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const icon = toast.type === 'order-filled'
    ? <TrendingUp className="h-5 w-5 text-green-400" />
    : <FileCheck className="h-5 w-5 text-blue-400" />

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-600 bg-slate-800 p-3 shadow-lg">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-100">{toast.title}</div>
        <div className="text-sm text-slate-400 truncate">{toast.message}</div>
      </div>
      <button
        onClick={onDismiss}
        className="text-slate-400 hover:text-slate-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  )
}
