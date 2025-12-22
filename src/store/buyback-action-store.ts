import { create } from 'zustand'
import type { BuybackTabType } from '@/features/buyback'

export interface BuybackAction {
  text: string
  securityTab: BuybackTabType
}

interface BuybackActionStore {
  pendingAction: BuybackAction | null
  triggerBuyback: (action: BuybackAction) => void
  clearAction: () => void
}

export const useBuybackActionStore = create<BuybackActionStore>((set) => ({
  pendingAction: null,
  triggerBuyback: (action) => set({ pendingAction: action }),
  clearAction: () => set({ pendingAction: null }),
}))

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
