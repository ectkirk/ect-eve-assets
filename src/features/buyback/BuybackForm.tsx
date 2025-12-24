import { useState } from 'react'

interface BuybackFormProps {
  onSubmit: (text: string) => void
  isLoading?: boolean
  hasQuote?: boolean
  onReset?: () => void
  submitLabel?: string
  resetLabel?: string
  defaultText?: string
}

export function BuybackForm({
  onSubmit,
  isLoading = false,
  hasQuote = false,
  onReset,
  submitLabel = 'Get Quote',
  resetLabel = 'Create a new quote',
  defaultText = '',
}: BuybackFormProps) {
  const [text, setText] = useState(defaultText)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim() && !isLoading) {
      onSubmit(text)
    }
  }

  const handleClear = () => {
    setText('')
  }

  const handleReset = () => {
    setText('')
    onReset?.()
  }

  const lineCount = text.trim() ? text.trim().split('\n').length : 0

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="items-input"
          className="mb-2 block text-sm font-medium text-content-secondary"
        >
          Item list
        </label>
        <textarea
          id="items-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste items from EVE (inventory, contracts, fittings, etc.)"
          rows={12}
          className={`w-full rounded-lg border px-4 py-3 font-mono text-sm transition-colors focus:outline-none ${
            hasQuote
              ? 'cursor-not-allowed border-border bg-surface text-content-muted'
              : 'border-border bg-surface-secondary text-content placeholder-content-muted focus:border-accent focus:ring-2 focus:ring-action/20'
          }`}
          disabled={isLoading || hasQuote}
        />
        <div className="mt-2 text-sm text-content-secondary">
          {lineCount > 0
            ? `${lineCount} line${lineCount !== 1 ? 's' : ''}`
            : 'No items'}
        </div>
      </div>

      <div className="flex gap-3">
        {hasQuote ? (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg bg-action px-6 py-2.5 font-medium text-action-foreground transition-colors hover:bg-action-hover focus:ring-2 focus:ring-action focus:ring-offset-2 focus:ring-offset-surface focus:outline-none"
          >
            {resetLabel}
          </button>
        ) : (
          <>
            <button
              type="submit"
              disabled={!text.trim() || isLoading}
              className="rounded-lg bg-action px-6 py-2.5 font-medium text-action-foreground transition-colors hover:bg-action-hover focus:ring-2 focus:ring-action focus:ring-offset-2 focus:ring-offset-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Calculating...
                </span>
              ) : (
                submitLabel
              )}
            </button>
            {text.trim() && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="rounded-lg border border-border px-4 py-2.5 font-medium text-content-secondary transition-colors hover:bg-surface-secondary focus:ring-2 focus:ring-border focus:ring-offset-2 focus:ring-offset-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </>
        )}
      </div>
    </form>
  )
}
