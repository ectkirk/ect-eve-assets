import { useCallback, type Dispatch, type SetStateAction } from 'react'

export function useSetToggle<T>(
  setState: Dispatch<SetStateAction<Set<T>>>
): (item: T) => void {
  return useCallback(
    (item: T) => {
      setState((prev) => {
        const next = new Set(prev)
        if (next.has(item)) {
          next.delete(item)
        } else {
          next.add(item)
        }
        return next
      })
    },
    [setState]
  )
}
