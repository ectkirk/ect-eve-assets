import { useState, useEffect } from 'react'
import { subscribe } from '@/store/reference-cache'

export function useCacheVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), [])
  return version
}
