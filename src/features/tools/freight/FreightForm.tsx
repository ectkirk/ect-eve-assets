import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

interface FreightFormProps {
  onSubmit: (text: string) => void
  isLoading?: boolean
  hasResult?: boolean
  onReset?: () => void
  defaultText?: string
}

export function FreightForm({
  onSubmit,
  isLoading = false,
  hasResult = false,
  onReset,
  defaultText = '',
}: FreightFormProps) {
  const { t } = useTranslation('tools')
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
          htmlFor="freight-input"
          className="mb-2 block text-sm font-medium text-content-secondary"
        >
          {t('freight.itemList')}
        </label>
        <textarea
          id="freight-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('freight.placeholder')}
          rows={8}
          className={`w-full rounded-lg border px-4 py-3 font-mono text-sm transition-colors focus:outline-none ${
            hasResult
              ? 'cursor-not-allowed border-border bg-surface text-content-muted'
              : 'border-border bg-surface-secondary text-content placeholder-content-muted focus:border-accent focus:ring-2 focus:ring-action/20'
          }`}
          disabled={isLoading || hasResult}
        />
        <div className="mt-2 text-sm text-content-secondary">
          {lineCount > 0
            ? t('freight.lineCount', { count: lineCount })
            : t('freight.noItems')}
        </div>
      </div>

      <div className="flex gap-3">
        {hasResult ? (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg bg-action px-6 py-2.5 font-medium text-action-foreground transition-colors hover:bg-action-hover focus:ring-2 focus:ring-action focus:ring-offset-2 focus:ring-offset-surface focus:outline-none"
          >
            {t('freight.newShipment')}
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('freight.calculating')}
                </span>
              ) : (
                t('freight.calculate')
              )}
            </button>
            {text.trim() && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="rounded-lg border border-border px-4 py-2.5 font-medium text-content-secondary transition-colors hover:bg-surface-secondary focus:ring-2 focus:ring-border focus:ring-offset-2 focus:ring-offset-surface focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('freight.clear')}
              </button>
            )}
          </>
        )}
      </div>
    </form>
  )
}
