import { createInfoStore } from './create-info-store'
import { getLanguage } from './settings-store'

export const useFreightInfoStore = createInfoStore<ShippingInfoResult>({
  name: 'FreightInfo',
  fetchFn: () =>
    window.electronAPI!.refShippingInfo({ language: getLanguage() }),
})
