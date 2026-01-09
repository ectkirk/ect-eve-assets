import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { type Namespace } from '@/i18n'

import commonEn from '@/i18n/locales/en/common.json'
import layoutEn from '@/i18n/locales/en/layout.json'
import assetsEn from '@/i18n/locales/en/assets.json'
import contractsEn from '@/i18n/locales/en/contracts.json'
import industryEn from '@/i18n/locales/en/industry.json'
import marketEn from '@/i18n/locales/en/market.json'
import walletEn from '@/i18n/locales/en/wallet.json'
import clonesEn from '@/i18n/locales/en/clones.json'
import loyaltyEn from '@/i18n/locales/en/loyalty.json'
import structuresEn from '@/i18n/locales/en/structures.json'
import toolsEn from '@/i18n/locales/en/tools.json'
import dialogsEn from '@/i18n/locales/en/dialogs.json'

const enResources: Record<Namespace, Record<string, string>> = {
  common: commonEn,
  layout: layoutEn,
  assets: assetsEn,
  contracts: contractsEn,
  industry: industryEn,
  market: marketEn,
  wallet: walletEn,
  clones: clonesEn,
  loyalty: loyaltyEn,
  structures: structuresEn,
  tools: toolsEn,
  dialogs: dialogsEn,
}

i18n.use(initReactI18next).init({
  resources: { en: enResources },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
})

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))
