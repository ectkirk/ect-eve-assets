import { cn } from '@/lib/utils'

export function InfoRow({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
      <span className="text-content-secondary text-sm">{label}</span>
      <span className={cn('text-sm font-medium', className)}>{value}</span>
    </div>
  )
}

export function InfoSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">
        {title}
      </h4>
      <div className="bg-surface-secondary/50 rounded-lg px-3 py-1">
        {children}
      </div>
    </div>
  )
}
