import { create } from 'zustand'
import { useAuthStore, type Owner, ownerKey as makeOwnerKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESICorporationWalletDivisionSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { z } from 'zod'

export type ESICorporationWalletDivision = z.infer<typeof ESICorporationWalletDivisionSchema>

const ENDPOINT_PATTERN = '/wallet'

const DB_NAME = 'ecteveassets-wallet'
const DB_VERSION = 1
const STORE_WALLET = 'wallet'
const STORE_META = 'meta'

export interface CharacterWallet {
  owner: Owner
  balance: number
}

export interface CorporationWallet {
  owner: Owner
  divisions: ESICorporationWalletDivision[]
}

export type OwnerWallet = CharacterWallet | CorporationWallet

export function isCorporationWallet(wallet: OwnerWallet): wallet is CorporationWallet {
  return wallet.owner.type === 'corporation'
}

interface StoredOwnerWallet {
  ownerKey: string
  owner: Owner
  balance?: number
  divisions?: ESICorporationWalletDivision[]
}

interface WalletState {
  walletsByOwner: OwnerWallet[]
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface WalletActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  getTotalBalance: () => number
}

type WalletStore = WalletState & WalletActions

let db: IDBDatabase | null = null

function getWalletEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/wallets/`
  }
  return `/characters/${owner.characterId}/wallet/`
}

async function fetchOwnerWalletWithMeta(owner: Owner): Promise<ESIResponseMeta<CharacterWallet | CorporationWallet>> {
  if (owner.type === 'corporation') {
    const result = await esi.fetchWithMeta<ESICorporationWalletDivision[]>(
      `/corporations/${owner.id}/wallets/`,
      { characterId: owner.characterId, schema: z.array(ESICorporationWalletDivisionSchema) }
    )
    return {
      data: { owner, divisions: result.data } as CorporationWallet,
      expiresAt: result.expiresAt,
      etag: result.etag,
      notModified: result.notModified,
    }
  }
  const result = await esi.fetchWithMeta<number>(
    `/characters/${owner.characterId}/wallet/`,
    { characterId: owner.characterId, schema: z.number() }
  )
  return {
    data: { owner, balance: result.data } as CharacterWallet,
    expiresAt: result.expiresAt,
    etag: result.etag,
    notModified: result.notModified,
  }
}

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open wallet DB', request.error, { module: 'WalletStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_WALLET)) {
        database.createObjectStore(STORE_WALLET, { keyPath: 'ownerKey' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<{ walletsByOwner: OwnerWallet[] }> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_WALLET], 'readonly')
    const walletStore = tx.objectStore(STORE_WALLET)

    const walletsByOwner: OwnerWallet[] = []
    const walletRequest = walletStore.getAll()

    tx.oncomplete = () => {
      for (const stored of walletRequest.result as StoredOwnerWallet[]) {
        if (stored.divisions) {
          walletsByOwner.push({ owner: stored.owner, divisions: stored.divisions })
        } else {
          walletsByOwner.push({ owner: stored.owner, balance: stored.balance ?? 0 })
        }
      }
      resolve({ walletsByOwner })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveOwnerToDB(ownerKey: string, wallet: OwnerWallet): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_WALLET], 'readwrite')
    const walletStore = tx.objectStore(STORE_WALLET)

    if (isCorporationWallet(wallet)) {
      walletStore.put({ ownerKey, owner: wallet.owner, divisions: wallet.divisions })
    } else {
      walletStore.put({ ownerKey, owner: wallet.owner, balance: wallet.balance })
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteOwnerFromDB(ownerKey: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_WALLET], 'readwrite')
    const walletStore = tx.objectStore(STORE_WALLET)

    walletStore.delete(ownerKey)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_WALLET, STORE_META], 'readwrite')
    tx.objectStore(STORE_WALLET).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  walletsByOwner: [],
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { walletsByOwner } = await loadFromDB()
      set({ walletsByOwner, initialized: true })
      logger.info('Wallet store initialized', {
        module: 'WalletStore',
        owners: walletsByOwner.length,
      })
    } catch (err) {
      logger.error('Failed to load wallet from DB', err instanceof Error ? err : undefined, {
        module: 'WalletStore',
      })
      set({ initialized: true })
    }
  },

  getTotalBalance: () => {
    const { walletsByOwner } = get()
    let total = 0
    for (const wallet of walletsByOwner) {
      if (isCorporationWallet(wallet)) {
        for (const div of wallet.divisions) {
          total += div.balance
        }
      } else {
        total += wallet.balance
      }
    }
    return total
  },

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? owners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : owners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getWalletEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need wallet update', { module: 'WalletStore' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const existingWallets = new Map(
        state.walletsByOwner.map((ow) => [`${ow.owner.type}-${ow.owner.id}`, ow])
      )

      for (const owner of ownersToUpdate) {
        const ownerKey = `${owner.type}-${owner.id}`
        const endpoint = getWalletEndpoint(owner)

        try {
          logger.info('Fetching wallet', { module: 'WalletStore', owner: owner.name })
          const { data: walletData, expiresAt, etag } = await fetchOwnerWalletWithMeta(owner)

          await saveOwnerToDB(ownerKey, walletData)
          existingWallets.set(ownerKey, walletData)

          useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)
        } catch (err) {
          logger.error('Failed to fetch wallet', err instanceof Error ? err : undefined, {
            module: 'WalletStore',
            owner: owner.name,
          })
        }
      }

      const results = Array.from(existingWallets.values())

      set({
        walletsByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any wallets' : null,
      })

      logger.info('Wallet updated', {
        module: 'WalletStore',
        owners: ownersToUpdate.length,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Wallet update failed', err instanceof Error ? err : undefined, {
        module: 'WalletStore',
      })
    }
  },

  updateForOwner: async (owner: Owner) => {
    const state = get()

    try {
      const ownerKey = `${owner.type}-${owner.id}`
      const endpoint = getWalletEndpoint(owner)

      logger.info('Fetching wallet for owner', { module: 'WalletStore', owner: owner.name })
      const { data: walletData, expiresAt, etag } = await fetchOwnerWalletWithMeta(owner)

      await saveOwnerToDB(ownerKey, walletData)
      useExpiryCacheStore.getState().setExpiry(ownerKey, endpoint, expiresAt, etag)

      const updated = state.walletsByOwner.filter(
        (ow) => `${ow.owner.type}-${ow.owner.id}` !== ownerKey
      )
      updated.push(walletData)

      set({ walletsByOwner: updated })

      logger.info('Wallet updated for owner', {
        module: 'WalletStore',
        owner: owner.name,
      })
    } catch (err) {
      logger.error('Failed to fetch wallet for owner', err instanceof Error ? err : undefined, {
        module: 'WalletStore',
        owner: owner.name,
      })
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.walletsByOwner.filter(
      (ow) => `${ow.owner.type}-${ow.owner.id}` !== ownerKey
    )

    if (updated.length === state.walletsByOwner.length) return

    await deleteOwnerFromDB(ownerKey)
    set({ walletsByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Wallet removed for owner', { module: 'WalletStore', ownerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      walletsByOwner: [],
      updateError: null,
      initialized: false,
    })
  },
}))

function findOwnerByKey(ownerKeyStr: string): Owner | undefined {
  const owners = useAuthStore.getState().owners
  for (const owner of Object.values(owners)) {
    if (owner && makeOwnerKey(owner.type, owner.id) === ownerKeyStr) {
      return owner
    }
  }
  return undefined
}

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'WalletStore', ownerKey: ownerKeyStr })
    return
  }
  await useWalletStore.getState().updateForOwner(owner)
})
