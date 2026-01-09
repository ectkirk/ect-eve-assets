import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LANGUAGE_OPTIONS,
  type SupportedLanguage,
} from '@/store/settings-store'

interface LanguageSelectionModalProps {
  detectedLanguage: SupportedLanguage
  onSelect: (language: SupportedLanguage) => void
}

export function LanguageSelectionModal({
  detectedLanguage,
  onSelect,
}: LanguageSelectionModalProps) {
  const { t } = useTranslation('dialogs')
  const [selected, setSelected] = useState<SupportedLanguage>(detectedLanguage)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-content">
          {t('languageSelect.title')}
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          {t('languageSelect.description')}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelected(option.value)}
              className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                selected === option.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-content hover:border-accent/50 hover:bg-surface-secondary'
              }`}
            >
              {option.label}
              {option.value === detectedLanguage && (
                <span className="ml-1 text-xs text-content-muted">
                  ({t('languageSelect.detected')})
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => onSelect(selected)}
          className="mt-6 w-full rounded-md bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {t('languageSelect.continue')}
        </button>
      </div>
    </div>
  )
}
