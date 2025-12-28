import { useEffect } from 'react'
import type { StoreApi } from 'zustand'

interface ActionStore<T> {
  pendingAction: T | null
  clearAction: () => void
}

/**
 * Subscribes to a navigation action store and calls the handler when a new action is detected.
 * Automatically clears the action after the handler is called.
 *
 * Pattern used for cross-tab navigation (e.g., "View in Regional Market", "View in Contracts").
 * The action store holds a pending action, MainLayout subscribes and navigates,
 * then the target panel consumes the initial data and calls the cleanup callback.
 */
export function useNavigationAction<T>(
  store: StoreApi<ActionStore<T>>,
  onAction: (action: T) => void
): void {
  useEffect(() => {
    return store.subscribe((state, prevState) => {
      if (state.pendingAction && !prevState.pendingAction) {
        onAction(state.pendingAction)
        queueMicrotask(() => {
          store.getState().clearAction()
        })
      }
    })
  }, [store, onAction])
}
