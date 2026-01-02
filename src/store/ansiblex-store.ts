import { create } from 'zustand'
import { DB } from '@/lib/db-constants'
import {
  openDatabase,
  idbGetAll,
  idbPut,
  idbClear,
  deleteDatabase,
} from '@/lib/idb-utils'
import { logger } from '@/lib/logger'
import { getAllSystems, type CachedSystem } from '@/store/reference-cache'

export const ANSIBLEX_TYPE_ID = 35841
const SEARCH_TTL_MS = 60 * 60 * 1000 // 1 hour

export interface Ansiblex {
  id: number
  name: string
  fromSystemId: number
  toSystemId: number
  ownerId: number
}

interface ESISearchResult {
  structure?: number[]
}

interface ESIStructureInfo {
  name: string
  owner_id: number
  solar_system_id: number
  type_id: number
}

interface PersistedAnsiblexData {
  characterId: string
  ansiblexes: Ansiblex[]
  lastSearchAt: number
}

interface AnsiblexState {
  ansiblexesByCharacter: Map<string, Ansiblex[]>
  lastSearch: Map<string, number>
  loading: boolean
  initialized: boolean

  init: () => Promise<void>
  fetchForCharacter: (characterId: string) => Promise<void>
  clear: () => Promise<void>
}

async function getDb() {
  return openDatabase(DB.ANSIBLEX)
}

let initPromise: Promise<void> | null = null

function parseAnsiblexName(
  name: string
): { fromSystem: string; toSystem: string } | null {
  const match = name.match(/^(.+?)\s*»\s*(.+?)(?:\s+-|$)/)
  if (!match) return null
  return {
    fromSystem: match[1]!.trim(),
    toSystem: match[2]!.trim(),
  }
}

export const useAnsiblexStore = create<AnsiblexState>()((set, get) => ({
  ansiblexesByCharacter: new Map(),
  lastSearch: new Map(),
  loading: false,
  initialized: false,

  init: async () => {
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        const db = await getDb()
        const stored = await idbGetAll<PersistedAnsiblexData>(db, 'ansiblexes')

        const ansiblexesByCharacter = new Map<string, Ansiblex[]>()
        const lastSearch = new Map<string, number>()

        for (const data of stored) {
          ansiblexesByCharacter.set(data.characterId, data.ansiblexes)
          lastSearch.set(data.characterId, data.lastSearchAt)
        }

        set({ ansiblexesByCharacter, lastSearch, initialized: true })

        logger.info('Ansiblex store initialized', {
          module: 'AnsiblexStore',
          characters: stored.length,
          total: Array.from(ansiblexesByCharacter.values()).flat().length,
        })
      } catch (err) {
        logger.error('Failed to initialize ansiblex store', err as Error, {
          module: 'AnsiblexStore',
        })
      }
    })()

    return initPromise
  },

  fetchForCharacter: async (characterId: string) => {
    const state = get()

    const lastSearchTime = state.lastSearch.get(characterId) ?? 0
    if (Date.now() - lastSearchTime < SEARCH_TTL_MS) {
      return
    }

    set({ loading: true })

    const charId = parseInt(characterId, 10)
    const existingAnsiblexes =
      state.ansiblexesByCharacter.get(characterId) ?? []
    const existingById = new Map(existingAnsiblexes.map((a) => [a.id, a]))

    try {
      const searchResult = await window.electronAPI?.esi.fetch<ESISearchResult>(
        `/characters/${charId}/search/?categories=structure&search=${encodeURIComponent(' » ')}`,
        { characterId: charId, requiresAuth: true }
      )

      const structureIds = searchResult?.structure ?? []

      if (structureIds.length === 0) {
        const db = await getDb()
        await idbPut(db, 'ansiblexes', {
          characterId,
          ansiblexes: [],
          lastSearchAt: Date.now(),
        })

        set((s) => ({
          loading: false,
          ansiblexesByCharacter: new Map(s.ansiblexesByCharacter).set(
            characterId,
            []
          ),
          lastSearch: new Map(s.lastSearch).set(characterId, Date.now()),
        }))
        return
      }

      const currentIds = new Set(structureIds)
      const newStructureIds = structureIds.filter((id) => !existingById.has(id))
      const keptAnsiblexes = existingAnsiblexes.filter((a) =>
        currentIds.has(a.id)
      )

      logger.info('Ansiblex search complete', {
        module: 'AnsiblexStore',
        characterId,
        total: structureIds.length,
        new: newStructureIds.length,
        kept: keptAnsiblexes.length,
        pruned: existingAnsiblexes.length - keptAnsiblexes.length,
      })

      if (newStructureIds.length === 0) {
        const db = await getDb()
        await idbPut(db, 'ansiblexes', {
          characterId,
          ansiblexes: keptAnsiblexes,
          lastSearchAt: Date.now(),
        })

        set((s) => ({
          loading: false,
          ansiblexesByCharacter: new Map(s.ansiblexesByCharacter).set(
            characterId,
            keptAnsiblexes
          ),
          lastSearch: new Map(s.lastSearch).set(characterId, Date.now()),
        }))
        return
      }

      const systemsByName = new Map<string, CachedSystem>()
      for (const system of getAllSystems()) {
        systemsByName.set(system.name.toLowerCase(), system)
      }

      const newAnsiblexes: Ansiblex[] = []

      for (const structureId of newStructureIds) {
        try {
          const details = await window.electronAPI?.esi.fetch<ESIStructureInfo>(
            `/universe/structures/${structureId}/`,
            { characterId: charId, requiresAuth: true }
          )

          if (!details || details.type_id !== ANSIBLEX_TYPE_ID) continue

          const parsed = parseAnsiblexName(details.name)
          if (!parsed) continue

          const fromSystem = systemsByName.get(parsed.fromSystem.toLowerCase())
          const toSystem = systemsByName.get(parsed.toSystem.toLowerCase())

          if (!fromSystem || !toSystem) continue

          newAnsiblexes.push({
            id: structureId,
            name: details.name,
            fromSystemId: fromSystem.id,
            toSystemId: toSystem.id,
            ownerId: details.owner_id,
          })
        } catch {
          // Skip structures we can't access
        }
      }

      const allAnsiblexes = [...keptAnsiblexes, ...newAnsiblexes]

      const db = await getDb()
      await idbPut(db, 'ansiblexes', {
        characterId,
        ansiblexes: allAnsiblexes,
        lastSearchAt: Date.now(),
      })

      set((s) => ({
        loading: false,
        ansiblexesByCharacter: new Map(s.ansiblexesByCharacter).set(
          characterId,
          allAnsiblexes
        ),
        lastSearch: new Map(s.lastSearch).set(characterId, Date.now()),
      }))

      logger.info('Ansiblex data updated', {
        module: 'AnsiblexStore',
        characterId,
        fetched: newAnsiblexes.length,
        total: allAnsiblexes.length,
      })
    } catch (err) {
      logger.error('Failed to fetch ansiblex data', err as Error, {
        module: 'AnsiblexStore',
        characterId,
      })
      set({ loading: false })
    }
  },

  clear: async () => {
    try {
      const db = await getDb()
      await idbClear(db, 'ansiblexes')
      initPromise = null
      set({
        ansiblexesByCharacter: new Map(),
        lastSearch: new Map(),
        initialized: false,
      })
      logger.info('Ansiblex cache cleared', { module: 'AnsiblexStore' })
    } catch (err) {
      logger.error('Failed to clear ansiblex cache', err as Error, {
        module: 'AnsiblexStore',
      })
    }
  },
}))

export async function deleteAnsiblexDatabase(): Promise<void> {
  return deleteDatabase(DB.ANSIBLEX.name, 'AnsiblexStore')
}
