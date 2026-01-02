import { useRef, useEffect, useCallback } from 'react'

export function useDebounce<T>(
  callback: (arg: T) => void,
  delay: number
): (arg: T) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return useCallback(
    (arg: T) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => callbackRef.current(arg), delay)
    },
    [delay]
  )
}
