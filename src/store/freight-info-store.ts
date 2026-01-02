import { createInfoStore } from './create-info-store'

export const useFreightInfoStore = createInfoStore<ShippingInfoResult>({
  name: 'FreightInfo',
  fetchFn: () => window.electronAPI!.refShippingInfo(),
})
