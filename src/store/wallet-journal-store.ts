import { create } from 'zustand'
import {
  useAuthStore,
  type Owner,
  ownerKey,
  findOwnerByKey,
} from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esi } from '@/api/esi'
import { ESIWalletJournalEntrySchema } from '@/api/schemas'
import { createOwnerDB } from '@/lib/owner-indexed-db'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export const CORPORATION_WALLET_DIVISIONS = 7

export const DEFAULT_WALLET_NAMES = [
  'Master Wallet',
  '2nd Wallet Division',
  '3rd Wallet Division',
  '4th Wallet Division',
  '5th Wallet Division',
  '6th Wallet Division',
  '7th Wallet Division',
]

export type ESIWalletJournalEntry = z.infer<typeof ESIWalletJournalEntrySchema>

export interface JournalEntry extends ESIWalletJournalEntry {
  division?: number
}

interface JournalData {
  entries: JournalEntry[]
}

export interface OwnerJournal {
  owner: Owner
  entries: JournalEntry[]
}

function getExistingData(owner: Owner): {
  entries: JournalEntry[]
  entryIds: Set<number>
} {
  const state = useWalletJournalStore.getState()
  const key = ownerKey(owner.type, owner.id)
  const ownerData = state.journalByOwner.find(
    (j) => ownerKey(j.owner.type, j.owner.id) === key
  )
  const entries = ownerData?.entries ?? []
  return {
    entries,
    entryIds: new Set(entries.map((e) => e.id)),
  }
}

interface JournalState {
  journalByOwner: OwnerJournal[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface JournalActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type JournalStore = JournalState & JournalActions

const ENDPOINT_PATTERN = '/wallet/journal'

const db = createOwnerDB<JournalData>({
  dbName: 'ecteveassets-wallet-journal',
  storeName: 'journal',
  dataKey: 'entries',
  metaStoreName: 'meta',
  moduleName: 'WalletJournalStore',
})

function getJournalEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/wallets/1/journal/`
  }
  return `/characters/${owner.characterId}/wallet/journal/`
}

async function fetchJournalIncremental(
  endpoint: string,
  characterId: number,
  existingEntryIds: Set<number>,
  division?: number
): Promise<{
  entries: JournalEntry[]
  expiresAt: number
  etag: string | null
  stoppedEarly: boolean
}> {
  const newEntries: JournalEntry[] = []
  let page = 1
  let totalPages = 1
  let expiresAt = Date.now() + 3600000
  let etag: string | null = null
  let foundExisting = false

  while (page <= totalPages && !foundExisting) {
    const pagedEndpoint = `${endpoint}?page=${page}`

    try {
      const result = await esi.fetchWithMeta<ESIWalletJournalEntry[]>(
        pagedEndpoint,
        {
          characterId,
          schema: ESIWalletJournalEntrySchema.array(),
        }
      )

      expiresAt = result.expiresAt
      etag = result.etag
      if (result.xPages) totalPages = result.xPages

      for (const entry of result.data) {
        if (existingEntryIds.has(entry.id)) {
          foundExisting = true
          break
        }
        const journalEntry: JournalEntry =
          division !== undefined ? { ...entry, division } : entry
        newEntries.push(journalEntry)
      }

      page++
    } catch (err) {
      logger.error(
        'Failed to fetch journal page',
        err instanceof Error ? err : undefined,
        {
          module: 'WalletJournalStore',
          endpoint,
          page,
        }
      )
      throw err
    }
  }

  return { entries: newEntries, expiresAt, etag, stoppedEarly: foundExisting }
}

async function fetchJournalForOwner(owner: Owner): Promise<{
  entries: JournalEntry[]
  expiresAt: number
  etag?: string | null
}> {
  const { entries: existingEntries, entryIds: existingEntryIds } =
    getExistingData(owner)

  if (owner.type === 'corporation') {
    const newEntries: JournalEntry[] = []
    let latestExpiry = 0
    let latestEtag: string | null = null
    let anyStoppedEarly = false

    for (
      let division = 1;
      division <= CORPORATION_WALLET_DIVISIONS;
      division++
    ) {
      try {
        const result = await fetchJournalIncremental(
          `/corporations/${owner.id}/wallets/${division}/journal/`,
          owner.characterId,
          existingEntryIds,
          division
        )
        newEntries.push(...result.entries)
        if (result.expiresAt > latestExpiry) {
          latestExpiry = result.expiresAt
          latestEtag = result.etag
        }
        if (result.stoppedEarly) anyStoppedEarly = true
      } catch {
        logger.warn(`Failed to fetch journal for division ${division}`, {
          module: 'WalletJournalStore',
          owner: owner.name,
          division,
        })
      }
    }

    const mergedEntries = [...newEntries, ...existingEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    logger.info('Corporation journal fetched', {
      module: 'WalletJournalStore',
      owner: owner.name,
      newEntries: newEntries.length,
      existing: existingEntries.length,
      total: mergedEntries.length,
      stoppedEarly: anyStoppedEarly,
    })

    return { entries: mergedEntries, expiresAt: latestExpiry, etag: latestEtag }
  }

  const result = await fetchJournalIncremental(
    `/characters/${owner.characterId}/wallet/journal/`,
    owner.characterId,
    existingEntryIds
  )

  const mergedEntries = [...result.entries, ...existingEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  logger.info('Character journal fetched', {
    module: 'WalletJournalStore',
    owner: owner.name,
    newEntries: result.entries.length,
    existing: existingEntries.length,
    total: mergedEntries.length,
    stoppedEarly: result.stoppedEarly,
  })

  return {
    entries: mergedEntries,
    expiresAt: result.expiresAt,
    etag: result.etag,
  }
}

export const useWalletJournalStore = create<JournalStore>((set, get) => ({
  journalByOwner: [],
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const loaded = await db.loadAll()
      const journalByOwner = loaded.map((d) => ({
        owner: d.owner,
        entries: d.data.entries,
      }))
      set({ journalByOwner, initialized: true })
      logger.info('Wallet journal store initialized', {
        module: 'WalletJournalStore',
        owners: journalByOwner.length,
        entries: journalByOwner.reduce((sum, o) => sum + o.entries.length, 0),
      })
    } catch (err) {
      logger.error(
        'Failed to load journal from DB',
        err instanceof Error ? err : undefined,
        {
          module: 'WalletJournalStore',
        }
      )
      set({ initialized: true })
    }
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const allOwners = Object.values(useAuthStore.getState().owners)
    const validOwners = allOwners.filter(
      (o): o is Owner => !!o && !o.authFailed
    )

    if (validOwners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()
    const ownersToUpdate = force
      ? validOwners
      : validOwners.filter((owner) => {
          const key = ownerKey(owner.type, owner.id)
          const endpoint = getJournalEndpoint(owner)
          return expiryCacheStore.isExpired(key, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need journal update', {
        module: 'WalletJournalStore',
      })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existing = new Map(
        state.journalByOwner.map((j) => [ownerKey(j.owner.type, j.owner.id), j])
      )

      for (const owner of ownersToUpdate) {
        const key = ownerKey(owner.type, owner.id)
        const endpoint = getJournalEndpoint(owner)

        try {
          logger.info('Fetching wallet journal', {
            module: 'WalletJournalStore',
            owner: owner.name,
          })
          const { entries, expiresAt, etag } = await fetchJournalForOwner(owner)

          await db.save(key, owner, { entries })
          existing.set(key, { owner, entries })

          useExpiryCacheStore
            .getState()
            .setExpiry(key, endpoint, expiresAt, etag, entries.length === 0)
        } catch (err) {
          logger.error(
            'Failed to fetch journal',
            err instanceof Error ? err : undefined,
            {
              module: 'WalletJournalStore',
              owner: owner.name,
            }
          )
        }
      }

      const results = Array.from(existing.values())
      set({
        journalByOwner: results,
        isUpdating: false,
        updateError:
          results.length === 0 ? 'Failed to fetch any journals' : null,
      })

      logger.info('Wallet journal updated', {
        module: 'WalletJournalStore',
        owners: ownersToUpdate.length,
        totalEntries: results.reduce((sum, r) => sum + r.entries.length, 0),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error(
        'Journal update failed',
        err instanceof Error ? err : undefined,
        {
          module: 'WalletJournalStore',
        }
      )
    }
  },

  updateForOwner: async (owner: Owner) => {
    try {
      const key = ownerKey(owner.type, owner.id)
      const endpoint = getJournalEndpoint(owner)

      logger.info('Fetching journal for owner', {
        module: 'WalletJournalStore',
        owner: owner.name,
      })
      const { entries, expiresAt, etag } = await fetchJournalForOwner(owner)

      await db.save(key, owner, { entries })
      useExpiryCacheStore
        .getState()
        .setExpiry(key, endpoint, expiresAt, etag, entries.length === 0)

      const updated = get().journalByOwner.filter(
        (j) => ownerKey(j.owner.type, j.owner.id) !== key
      )
      updated.push({ owner, entries })

      set({ journalByOwner: updated })

      logger.info('Journal updated for owner', {
        module: 'WalletJournalStore',
        owner: owner.name,
        entries: entries.length,
      })
    } catch (err) {
      logger.error(
        'Failed to fetch journal for owner',
        err instanceof Error ? err : undefined,
        {
          module: 'WalletJournalStore',
          owner: owner.name,
        }
      )
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const key = `${ownerType}-${ownerId}`
    const updated = state.journalByOwner.filter(
      (j) => `${j.owner.type}-${j.owner.id}` !== key
    )

    if (updated.length === state.journalByOwner.length) return

    await db.delete(key)
    set({ journalByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(key)
    logger.info('Journal removed for owner', {
      module: 'WalletJournalStore',
      ownerKey: key,
    })
  },

  clear: async () => {
    await db.clear()
    set({
      journalByOwner: [],
      updateError: null,
      initialized: false,
    })
  },
}))

useExpiryCacheStore
  .getState()
  .registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
    const owner = findOwnerByKey(ownerKeyStr)
    if (!owner) {
      logger.warn('Owner not found for journal refresh', {
        module: 'WalletJournalStore',
        ownerKey: ownerKeyStr,
      })
      return
    }
    await useWalletJournalStore.getState().updateForOwner(owner)
  })
