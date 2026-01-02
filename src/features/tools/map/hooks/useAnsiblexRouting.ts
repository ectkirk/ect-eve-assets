import { useEffect, useMemo } from 'react'
import { useMapSettingsStore } from '@/store/map-settings-store'
import { useAnsiblexStore, type Ansiblex } from '@/store/ansiblex-store'
import { useAuthStore } from '@/store/auth-store'
import { logger } from '@/lib/logger'
import { edgeKey } from '../utils/pathfinder'

interface UseAnsiblexRoutingReturn {
  ansiblexes: Ansiblex[]
  ansiblexConnectionCount: number
  ansiblexRoutingEnabled: boolean
  useAnsiblexes: boolean
  setUseAnsiblexes: (use: boolean) => void
}

export function useAnsiblexRouting(): UseAnsiblexRoutingReturn {
  const ansiblexCharacterIds = useMapSettingsStore(
    (s) => s.ansiblexCharacterIds
  )
  const useAnsiblexes = useMapSettingsStore((s) => s.useAnsiblexes)
  const setUseAnsiblexes = useMapSettingsStore((s) => s.setUseAnsiblexes)
  const ansiblexesByCharacter = useAnsiblexStore((s) => s.ansiblexesByCharacter)
  const fetchAnsiblexForCharacter = useAnsiblexStore((s) => s.fetchForCharacter)
  const initAnsiblex = useAnsiblexStore((s) => s.init)
  const owners = useAuthStore((s) => s.owners)

  const characterIdsToFetch = useMemo(() => {
    if (ansiblexCharacterIds.length === 0) return []

    const seenCorps = new Set<number>()
    const result: string[] = []

    for (const ownerKey of ansiblexCharacterIds) {
      const owner = owners[ownerKey]
      if (!owner || owner.type !== 'character') continue

      if (seenCorps.has(owner.corporationId)) continue
      seenCorps.add(owner.corporationId)
      result.push(String(owner.id))
    }

    return result
  }, [ansiblexCharacterIds, owners])

  const ansiblexRoutingEnabled = ansiblexCharacterIds.length > 0

  const { ansiblexes, ansiblexConnectionCount } = useMemo(() => {
    const seenStructures = new Set<number>()
    const seenConnections = new Set<string>()
    const result: Ansiblex[] = []

    for (const list of ansiblexesByCharacter.values()) {
      for (const a of list) {
        if (!seenStructures.has(a.id)) {
          seenStructures.add(a.id)
          result.push(a)
          seenConnections.add(edgeKey(a.fromSystemId, a.toSystemId))
        }
      }
    }

    return { ansiblexes: result, ansiblexConnectionCount: seenConnections.size }
  }, [ansiblexesByCharacter])

  useEffect(() => {
    if (characterIdsToFetch.length > 0) {
      logger.info('Ansiblex effect running', {
        module: 'useAnsiblexRouting',
        characterCount: characterIdsToFetch.length,
        characterIds: characterIdsToFetch,
      })
      initAnsiblex().then(() => {
        for (const charId of characterIdsToFetch) {
          fetchAnsiblexForCharacter(charId)
        }
      })
    }
  }, [characterIdsToFetch, initAnsiblex, fetchAnsiblexForCharacter])

  return {
    ansiblexes,
    ansiblexConnectionCount,
    ansiblexRoutingEnabled,
    useAnsiblexes,
    setUseAnsiblexes,
  }
}
