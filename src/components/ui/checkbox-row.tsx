import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CheckboxRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  suffix?: ReactNode
  className?: string
}

export function CheckboxRow({
  label,
  description,
  checked,
  onChange,
  suffix,
  className,
}: CheckboxRowProps) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 py-1.5 px-2 rounded hover:bg-surface-tertiary cursor-pointer',
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          'h-4 w-4 rounded border-border text-accent focus:ring-accent',
          description && 'mt-0.5'
        )}
      />
      <div className="flex-1">
        <div className="text-sm text-content">{label}</div>
        {description && (
          <div className="text-xs text-content-muted">{description}</div>
        )}
      </div>
      {suffix}
    </label>
  )
}
