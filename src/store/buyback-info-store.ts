import { createInfoStore } from './create-info-store'

export const useBuybackInfoStore = createInfoStore<BuybackInfoResult>({
  name: 'BuybackInfo',
  fetchFn: () => window.electronAPI!.refBuybackInfo(),
})
