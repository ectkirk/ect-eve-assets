import { memo } from 'react'

interface ToggleOptionProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  count?: number
  countColorClass?: string
}

export const ToggleOption = memo(function ToggleOption({
  checked,
  onChange,
  label,
  count,
  countColorClass = 'text-content-muted',
}: ToggleOptionProps) {
  return (
    <label className="mt-2 flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
      />
      <span className="text-xs text-content-secondary">
        {label}
        {count !== undefined && count > 0 && (
          <span className={`ml-1 ${countColorClass}`}>({count})</span>
        )}
      </span>
    </label>
  )
})
