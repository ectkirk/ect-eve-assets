import { useState, useCallback } from 'react'

export function useLocalStorageSort<T extends string>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [sortBy, setSortByState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? (JSON.parse(stored) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setSortBy = useCallback(
    (value: T) => {
      setSortByState(value)
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Ignore storage errors
      }
    },
    [key]
  )

  return [sortBy, setSortBy]
}
