import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import {
  getCharacterWallet,
  getCorporationWallets,
  type ESICorporationWalletDivision,
} from '@/api/endpoints/wallet'
import { logger } from '@/lib/logger'

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
  lastUpdated: number | null
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

const UPDATE_COOLDOWN_MS = 5 * 60 * 1000

interface WalletActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
  getTotalBalance: () => number
}

type WalletStore = WalletState & WalletActions

let db: IDBDatabase | null = null

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

async function loadFromDB(): Promise<{
  walletsByOwner: OwnerWallet[]
  lastUpdated: number | null
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_WALLET, STORE_META], 'readonly')
    const walletStore = tx.objectStore(STORE_WALLET)
    const metaStore = tx.objectStore(STORE_META)

    const walletsByOwner: OwnerWallet[] = []
    const walletRequest = walletStore.getAll()
    const metaRequest = metaStore.getAll()

    tx.oncomplete = () => {
      for (const stored of walletRequest.result as StoredOwnerWallet[]) {
        if (stored.divisions) {
          walletsByOwner.push({ owner: stored.owner, divisions: stored.divisions })
        } else {
          walletsByOwner.push({ owner: stored.owner, balance: stored.balance ?? 0 })
        }
      }

      let lastUpdated: number | null = null
      for (const meta of metaRequest.result) {
        if (meta.key === 'lastUpdated') lastUpdated = meta.value
      }

      resolve({ walletsByOwner, lastUpdated })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(walletsByOwner: OwnerWallet[], lastUpdated: number): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_WALLET, STORE_META], 'readwrite')
    const walletStore = tx.objectStore(STORE_WALLET)
    const metaStore = tx.objectStore(STORE_META)

    walletStore.clear()
    for (const wallet of walletsByOwner) {
      const ownerKey = `${wallet.owner.type}-${wallet.owner.id}`
      if (isCorporationWallet(wallet)) {
        walletStore.put({ ownerKey, owner: wallet.owner, divisions: wallet.divisions })
      } else {
        walletStore.put({ ownerKey, owner: wallet.owner, balance: wallet.balance })
      }
    }

    metaStore.put({ key: 'lastUpdated', value: lastUpdated })

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
  lastUpdated: null,
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { walletsByOwner, lastUpdated } = await loadFromDB()
      set({ walletsByOwner, lastUpdated, initialized: true })
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

  canUpdate: () => {
    const { lastUpdated, isUpdating } = get()
    if (isUpdating) return false
    if (!lastUpdated) return true
    return Date.now() - lastUpdated >= UPDATE_COOLDOWN_MS
  },

  getTimeUntilUpdate: () => {
    const { lastUpdated } = get()
    if (!lastUpdated) return 0
    const elapsed = Date.now() - lastUpdated
    const remaining = UPDATE_COOLDOWN_MS - elapsed
    return remaining > 0 ? remaining : 0
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

    if (!force && state.lastUpdated && Date.now() - state.lastUpdated < UPDATE_COOLDOWN_MS) {
      const minutes = Math.ceil((UPDATE_COOLDOWN_MS - (Date.now() - state.lastUpdated)) / 60000)
      set({ updateError: `Update available in ${minutes} minute${minutes === 1 ? '' : 's'}` })
      return
    }

    const owners = Object.values(useAuthStore.getState().owners)
    if (owners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const results: OwnerWallet[] = []

      for (const owner of owners) {
        try {
          if (owner.type === 'corporation') {
            logger.info('Fetching corporation wallet', { module: 'WalletStore', owner: owner.name })
            const divisions = await getCorporationWallets(owner.characterId, owner.id)
            results.push({ owner, divisions })
          } else {
            logger.info('Fetching character wallet', { module: 'WalletStore', owner: owner.name })
            const balance = await getCharacterWallet(owner.characterId)
            results.push({ owner, balance })
          }
        } catch (err) {
          logger.error('Failed to fetch wallet', err instanceof Error ? err : undefined, {
            module: 'WalletStore',
            owner: owner.name,
          })
        }
      }

      const lastUpdated = Date.now()
      await saveToDB(results, lastUpdated)

      set({
        walletsByOwner: results,
        lastUpdated,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any wallets' : null,
      })

      logger.info('Wallet updated', {
        module: 'WalletStore',
        owners: results.length,
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
      logger.info('Fetching wallet for new owner', { module: 'WalletStore', owner: owner.name })

      let walletData: CharacterWallet | CorporationWallet
      if (owner.type === 'character') {
        const balance = await getCharacterWallet(owner.characterId)
        walletData = { owner, balance }
      } else {
        const divisions = await getCorporationWallets(owner.characterId, owner.id)
        walletData = { owner, divisions }
      }

      const ownerKey = `${owner.type}-${owner.id}`
      const updated = state.walletsByOwner.filter(
        (ow) => `${ow.owner.type}-${ow.owner.id}` !== ownerKey
      )
      updated.push(walletData)

      const lastUpdated = Date.now()
      await saveToDB(updated, lastUpdated)

      set({ walletsByOwner: updated, lastUpdated })

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

  clear: async () => {
    await clearDB()
    set({
      walletsByOwner: [],
      lastUpdated: null,
      updateError: null,
    })
  },
}))
