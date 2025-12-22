import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
}

interface MultiSelectDropdownProps {
  options: Option[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
  placeholder: string
  className?: string
}

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  className,
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const toggleOption = (value: string) => {
    const newSelected = new Set(selected)
    if (newSelected.has(value)) {
      newSelected.delete(value)
    } else {
      newSelected.add(value)
    }
    onChange(newSelected)
  }

  const selectAll = () => {
    onChange(new Set(options.map((o) => o.value)))
  }

  const clearAll = () => {
    onChange(new Set())
  }

  const displayText =
    selected.size === 0
      ? placeholder
      : selected.size === options.length
        ? placeholder
        : `${selected.size} selected`

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs bg-surface-secondary border border-border rounded px-2 py-1 hover:bg-surface-tertiary"
      >
        <span
          className={
            selected.size === 0 || selected.size === options.length
              ? 'text-content-secondary'
              : 'text-content'
          }
        >
          {displayText}
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-content-muted transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 min-w-[180px] max-h-[240px] overflow-auto rounded border border-border bg-surface-secondary shadow-lg">
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/50 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-content-secondary hover:text-content"
            >
              All
            </button>
            <span className="text-content-muted">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-content-secondary hover:text-content"
            >
              None
            </button>
          </div>
          {options.map((option) => {
            const isSelected = selected.has(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleOption(option.value)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs hover:bg-surface-tertiary"
              >
                <div
                  className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center',
                    isSelected ? 'bg-accent border-accent' : 'border-border'
                  )}
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
