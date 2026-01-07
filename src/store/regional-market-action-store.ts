import { createActionStore } from './create-action-store'

interface RegionalMarketAction {
  typeId: number
}

export const useRegionalMarketActionStore = createActionStore<
  RegionalMarketAction,
  'navigateToType',
  [number]
>('navigateToType', (typeId) => ({ typeId }))
