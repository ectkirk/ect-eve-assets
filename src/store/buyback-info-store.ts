import { createInfoStore } from './create-info-store'
import { getLanguage } from './settings-store'

export const useBuybackInfoStore = createInfoStore<BuybackInfoResult>({
  name: 'BuybackInfo',
  fetchFn: () =>
    window.electronAPI!.refBuybackInfo({ language: getLanguage() }),
})
