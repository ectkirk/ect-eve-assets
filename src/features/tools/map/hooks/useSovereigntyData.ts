import { useState, useEffect, useRef } from 'react'
import {
  getFactionWarfareSystems,
  getAllianceSovereignty,
} from '@/api/endpoints/sovereignty'
import type { ColorMode } from '../types'

type LoadState = 'idle' | 'loading' | 'loaded' | 'error'

function useLazyFetch<T, R>(
  shouldFetch: boolean,
  fetchFn: () => Promise<T>,
  extractData: (result: T) => R
): R | null {
  const [data, setData] = useState<R | null>(null)
  const stateRef = useRef<LoadState>('idle')
  const fetchFnRef = useRef(fetchFn)
  const extractDataRef = useRef(extractData)

  useEffect(() => {
    if (!shouldFetch) {
      if (stateRef.current === 'error') stateRef.current = 'idle'
      return
    }

    if (stateRef.current !== 'idle') return

    let cancelled = false
    stateRef.current = 'loading'

    fetchFnRef
      .current()
      .then((result) => {
        if (!cancelled) {
          setData(extractDataRef.current(result))
          stateRef.current = 'loaded'
        }
      })
      .catch(() => {
        if (!cancelled) stateRef.current = 'error'
      })

    return () => {
      cancelled = true
    }
  }, [shouldFetch])

  return data
}

interface UseSovereigntyDataReturn {
  fwData: Map<number, number> | null
  allianceData: Map<number, { allianceId: number; allianceName: string }> | null
}

export function useSovereigntyData(
  colorMode: ColorMode
): UseSovereigntyDataReturn {
  const fwData = useLazyFetch<
    Awaited<ReturnType<typeof getFactionWarfareSystems>>,
    Map<number, number>
  >(colorMode === 'faction', getFactionWarfareSystems, (r) => r.systems)

  const allianceData = useLazyFetch<
    Awaited<ReturnType<typeof getAllianceSovereignty>>,
    Map<number, { allianceId: number; allianceName: string }>
  >(colorMode === 'alliance', getAllianceSovereignty, (r) => r.systems)

  return { fwData, allianceData }
}
