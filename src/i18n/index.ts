import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLanguage, type SupportedLanguage } from '@/store/settings-store'

type TranslationModule = { default: Record<string, string> }

const CJK_LANGUAGES: SupportedLanguage[] = ['ja', 'ko', 'zh']

async function preloadCJKFont(): Promise<void> {
  try {
    await document.fonts.load('16px "Noto Sans CJK KR"')
  } catch {
    // Font loading failed, continue anyway - system fallback will be used
  }
}

export const NAMESPACES = [
  'common',
  'layout',
  'assets',
  'contracts',
  'industry',
  'market',
  'wallet',
  'clones',
  'loyalty',
  'structures',
  'tools',
  'dialogs',
] as const

export type Namespace = (typeof NAMESPACES)[number]

async function loadLanguage(
  lang: SupportedLanguage
): Promise<Record<string, Record<string, string>>> {
  const modules = await Promise.all(
    NAMESPACES.map(
      (ns) =>
        import(`./locales/${lang}/${ns}.json`) as Promise<TranslationModule>
    )
  )

  return Object.fromEntries(
    NAMESPACES.map((ns, i) => [ns, modules[i]!.default])
  )
}

export async function initI18n(): Promise<void> {
  const language = getLanguage()

  if (CJK_LANGUAGES.includes(language)) {
    await preloadCJKFont()
  }

  const resources = await loadLanguage(language)

  await i18n.use(initReactI18next).init({
    resources: { [language]: resources },
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: NAMESPACES,
    keySeparator: false,
    nsSeparator: ':',
    interpolation: {
      escapeValue: false,
    },
  })
}

export { i18n }
