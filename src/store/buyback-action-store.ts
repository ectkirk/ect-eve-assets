import { createActionStore } from './create-action-store'
import type { BuybackTabType } from '@/features/buyback'

export interface BuybackAction {
  text: string
  securityTab: BuybackTabType
}

export const useBuybackActionStore = createActionStore<
  BuybackAction,
  'triggerBuyback',
  [BuybackAction]
>('triggerBuyback', (action) => action)

export function getSecurityTab(
  securityStatus: number | null | undefined
): BuybackTabType {
  if (securityStatus === null || securityStatus === undefined) {
    return 'Null Sec'
  }
  if (securityStatus >= 0.45) {
    return 'High Sec'
  }
  if (securityStatus >= 0.0) {
    return 'Low Sec'
  }
  return 'Null Sec'
}
