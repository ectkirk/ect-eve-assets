import { create, type StoreApi, type UseBoundStore } from 'zustand'

type ActionStoreState<
  TAction,
  TTriggerName extends string,
  TArgs extends unknown[],
> = {
  pendingAction: TAction | null
  clearAction: () => void
} & { [K in TTriggerName]: (...args: TArgs) => void }

export function createActionStore<
  TAction,
  TTriggerName extends string,
  TArgs extends unknown[],
>(
  triggerName: TTriggerName,
  actionCreator: (...args: TArgs) => TAction
): UseBoundStore<StoreApi<ActionStoreState<TAction, TTriggerName, TArgs>>> {
  type Store = ActionStoreState<TAction, TTriggerName, TArgs>

  return create<Store>((set) => {
    const store = {
      pendingAction: null as TAction | null,
      clearAction: () =>
        set({ pendingAction: null } as unknown as Partial<Store>),
      [triggerName]: (...args: TArgs) =>
        set({
          pendingAction: actionCreator(...args),
        } as unknown as Partial<Store>),
    }
    return store as Store
  })
}
