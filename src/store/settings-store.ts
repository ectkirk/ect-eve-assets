import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useReferenceCacheStore } from './reference-cache'
import { clearNamesLRUCache } from '@/api/endpoints/universe'
import { logger } from '@/lib/logger'

export type SupportedLanguage =
  | 'de'
  | 'en'
  | 'es'
  | 'fr'
  | 'ja'
  | 'ko'
  | 'ru'
  | 'zh'

export const LANGUAGE_OPTIONS: { value: SupportedLanguage; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ru', label: 'Русский' },
  { value: 'zh', label: '中文' },
]

const SUPPORTED_CODES = new Set(LANGUAGE_OPTIONS.map((opt) => opt.value))

export function detectSystemLocale(): SupportedLanguage {
  const browserLocale = navigator.language || navigator.languages?.[0] || 'en'
  const langCode = (browserLocale.split('-')[0] ?? 'en').toLowerCase()
  return SUPPORTED_CODES.has(langCode as SupportedLanguage)
    ? (langCode as SupportedLanguage)
    : 'en'
}

interface SettingsState {
  language: SupportedLanguage
  hasSelectedLanguage: boolean
  setLanguage: (language: SupportedLanguage) => void
  setInitialLanguage: (language: SupportedLanguage) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      language: 'en',
      hasSelectedLanguage: false,
      setInitialLanguage: (language) => {
        logger.info('Initial language selected', {
          module: 'Settings',
          language,
        })
        set({ language, hasSelectedLanguage: true })
      },
      setLanguage: (language) => {
        const current = get().language
        if (current === language) return

        logger.info(
          'Language changed, clearing localized caches and reloading',
          {
            module: 'Settings',
            from: current,
            to: language,
          }
        )

        set({ language })

        localStorage.setItem(
          'settings',
          JSON.stringify({
            state: { language, hasSelectedLanguage: true },
            version: 0,
          })
        )

        clearNamesLRUCache()
        const cache = useReferenceCacheStore.getState()
        Promise.all([
          cache.clearCoreReferenceCache(),
          cache.clearUniverseCache(),
          cache.clearNamesCache(),
        ])
          .catch((err) => {
            logger.error('Failed to clear caches on language change', err, {
              module: 'Settings',
            })
          })
          .finally(() => {
            window.location.reload()
          })
      },
    }),
    { name: 'settings' }
  )
)

function getPersistedState(): {
  language?: string
  hasSelectedLanguage?: boolean
} | null {
  try {
    const stored = localStorage.getItem('settings')
    if (stored) {
      return JSON.parse(stored)?.state ?? null
    }
  } catch {
    // Fall through
  }
  return null
}

export function getLanguage(): SupportedLanguage {
  const persisted = getPersistedState()
  const lang = persisted?.language
  if (lang && SUPPORTED_CODES.has(lang as SupportedLanguage)) {
    return lang as SupportedLanguage
  }
  return useSettingsStore.getState().language
}

export function hasSelectedLanguage(): boolean {
  return getPersistedState()?.hasSelectedLanguage === true
}

export type LocalizedText = Partial<Record<SupportedLanguage, string>> & {
  en: string
}

export function getLocalizedText(
  obj: LocalizedText | null | undefined
): string {
  if (!obj) return ''
  const lang = getLanguage()
  return obj[lang] ?? obj.en
}
