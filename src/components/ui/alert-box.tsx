import { type ReactNode } from 'react'
import { AlertTriangle, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type AlertVariant = 'warning' | 'danger' | 'success' | 'info'

const variantStyles: Record<AlertVariant, string> = {
  warning: 'border-semantic-warning/50 bg-semantic-warning/10',
  danger: 'border-semantic-danger/30 bg-semantic-danger/10',
  success: 'border-status-positive/30 bg-status-positive/10',
  info: 'border-accent/30 bg-accent/10',
}

const variantIcons: Record<AlertVariant, typeof AlertTriangle> = {
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle,
  info: Info,
}

const variantIconColors: Record<AlertVariant, string> = {
  warning: 'text-semantic-warning',
  danger: 'text-semantic-danger',
  success: 'text-status-positive',
  info: 'text-accent',
}

interface AlertBoxProps {
  variant: AlertVariant
  title?: string
  children: ReactNode
  className?: string
  showIcon?: boolean
}

export function AlertBox({
  variant,
  title,
  children,
  className,
  showIcon = true,
}: AlertBoxProps) {
  const Icon = variantIcons[variant]

  return (
    <div
      className={cn('rounded-lg border p-4', variantStyles[variant], className)}
    >
      <div className="flex gap-3">
        {showIcon && (
          <Icon
            className={cn('h-5 w-5 shrink-0', variantIconColors[variant])}
          />
        )}
        <div className="space-y-2 text-sm">
          {title && <p className="font-medium text-content">{title}</p>}
          <div className="text-content-secondary">{children}</div>
        </div>
      </div>
    </div>
  )
}
