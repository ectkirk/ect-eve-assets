import { useState, useCallback } from 'react'
import { parseJsonString } from '@/lib/persisted-json'

export function useLocalStorageSort<T extends string>(
  key: string,
  defaultValue: T,
  isValid?: (value: string) => value is T,
): [T, (value: T) => void] {
  const [sortBy, setSortByState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      const parsed = parseJsonString(stored)
      if (!parsed) return defaultValue
      return isValid?.(parsed) === false ? defaultValue : parsed
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
        return
      }
    },
    [key],
  )

  return [sortBy, setSortBy]
}
