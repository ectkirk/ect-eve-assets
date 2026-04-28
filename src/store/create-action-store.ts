import { create, type StoreApi, type UseBoundStore } from 'zustand'

type ActionStoreState<
  TAction,
  TTriggerName extends string,
  TArgs extends unknown[],
> = {
  pendingAction: TAction | null
  clearAction: () => void
} & Record<TTriggerName, (...args: TArgs) => void>

export function createActionStore<
  TAction,
  TTriggerName extends string,
  TArgs extends unknown[],
>(
  triggerName: TTriggerName,
  actionCreator: (...args: TArgs) => TAction,
): UseBoundStore<StoreApi<ActionStoreState<TAction, TTriggerName, TArgs>>> {
  type Store = ActionStoreState<TAction, TTriggerName, TArgs>

  return create<Store>((set) => {
    const trigger = {
      [triggerName]: (...args: TArgs) => {
        set((state) => ({
          ...state,
          pendingAction: actionCreator(...args),
        }))
      },
    } as Record<TTriggerName, (...args: TArgs) => void>

    const store = {
      pendingAction: null as TAction | null,
      clearAction: () => {
        set((state) => ({
          ...state,
          pendingAction: null,
        }))
      },
      ...trigger,
    }
    return store
  })
}
