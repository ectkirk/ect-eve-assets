import { useState, useRef, useCallback } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useClickOutside } from '@/hooks'

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
  const { t } = useTranslation('common')
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const closeDropdown = useCallback(() => {
    setIsOpen(false)
    setFocusedIndex(-1)
  }, [])

  useClickOutside(containerRef, isOpen, closeDropdown)

  const toggleOption = useCallback(
    (value: string) => {
      const newSelected = new Set(selected)
      if (newSelected.has(value)) {
        newSelected.delete(value)
      } else {
        newSelected.add(value)
      }
      onChange(newSelected)
    },
    [selected, onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'Enter' ||
          e.key === ' '
        ) {
          e.preventDefault()
          setIsOpen(true)
          setFocusedIndex(0)
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Home':
          e.preventDefault()
          setFocusedIndex(0)
          break
        case 'End':
          e.preventDefault()
          setFocusedIndex(options.length - 1)
          break
        case 'Enter':
        case ' ': {
          e.preventDefault()
          const focusedOption = options[focusedIndex]
          if (focusedOption) {
            toggleOption(focusedOption.value)
          }
          break
        }
        case 'Escape':
          e.preventDefault()
          closeDropdown()
          buttonRef.current?.focus()
          break
      }
    },
    [isOpen, focusedIndex, options, toggleOption, closeDropdown]
  )

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
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
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
        <div
          ref={listRef}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-50 mt-1 min-w-[180px] max-h-[240px] overflow-auto rounded border border-border bg-surface-secondary shadow-lg"
        >
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/50 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-content-secondary hover:text-content"
            >
              {t('buttons.all')}
            </button>
            <span className="text-content-muted">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-content-secondary hover:text-content"
            >
              {t('buttons.none')}
            </button>
          </div>
          {options.map((option, index) => {
            const isSelected = selected.has(option.value)
            const isFocused = index === focusedIndex
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => toggleOption(option.value)}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs cursor-pointer',
                  isFocused
                    ? 'bg-surface-tertiary'
                    : 'hover:bg-surface-tertiary'
                )}
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
