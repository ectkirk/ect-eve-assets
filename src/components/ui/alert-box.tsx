import { type ReactNode } from 'react'
import { TriangleAlert, CircleAlert, CircleCheck, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type AlertVariant = 'warning' | 'danger' | 'success' | 'info'

const variantStyles = new Map<AlertVariant, string>([
  ['warning', 'border-semantic-warning/50 bg-semantic-warning/10'],
  ['danger', 'border-semantic-danger/30 bg-semantic-danger/10'],
  ['success', 'border-status-positive/30 bg-status-positive/10'],
  ['info', 'border-accent/30 bg-accent/10'],
])

const variantIconColors = new Map<AlertVariant, string>([
  ['warning', 'text-semantic-warning'],
  ['danger', 'text-semantic-danger'],
  ['success', 'text-status-positive'],
  ['info', 'text-accent'],
])

interface AlertBoxProps {
  variant: AlertVariant
  title?: string
  children: ReactNode
  className?: string
  showIcon?: boolean
}

function AlertIcon({ variant }: { variant: AlertVariant }) {
  const className = cn('h-5 w-5 shrink-0', variantIconColors.get(variant))
  switch (variant) {
    case 'warning':
      return <TriangleAlert className={className} />
    case 'danger':
      return <CircleAlert className={className} />
    case 'success':
      return <CircleCheck className={className} />
    case 'info':
      return <Info className={className} />
  }
}

export function AlertBox({
  variant,
  title,
  children,
  className,
  showIcon = true,
}: AlertBoxProps) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        variantStyles.get(variant),
        className,
      )}
    >
      <div className="flex gap-3">
        {showIcon && <AlertIcon variant={variant} />}
        <div className="space-y-2 text-sm">
          {title && <p className="font-medium text-content">{title}</p>}
          <div className="text-content-secondary">{children}</div>
        </div>
      </div>
    </div>
  )
}
