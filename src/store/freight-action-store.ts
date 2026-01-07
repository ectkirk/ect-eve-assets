import { createActionStore } from './create-action-store'

export interface FreightAction {
  text: string
  nullSec: boolean
}

export const useFreightActionStore = createActionStore<
  FreightAction,
  'triggerFreight',
  [FreightAction]
>('triggerFreight', (action) => action)
