import { createActionStore } from './create-action-store'

interface ReferenceAction {
  typeId: number
}

export const useReferenceActionStore = createActionStore<
  ReferenceAction,
  'navigateToType',
  [number]
>('navigateToType', (typeId) => ({ typeId }))
