import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import {
  getCharacterContracts,
  getContractItems,
  type ESIContract,
  type ESIContractItem,
} from '@/api/endpoints/contracts'
import { logger } from '@/lib/logger'

const DB_NAME = 'ecteveassets-contracts'
const DB_VERSION = 1
const STORE_CONTRACTS = 'contracts'
const STORE_META = 'meta'

export interface ContractWithItems {
  contract: ESIContract
  items: ESIContractItem[]
}

export interface OwnerContracts {
  owner: Owner
  contracts: ContractWithItems[]
}

interface StoredOwnerContracts {
  ownerKey: string
  owner: Owner
  contracts: ContractWithItems[]
}

interface ContractsState {
  contractsByOwner: OwnerContracts[]
  lastUpdated: number | null
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

const UPDATE_COOLDOWN_MS = 5 * 60 * 1000

interface ContractsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  clear: () => Promise<void>
  canUpdate: () => boolean
  getTimeUntilUpdate: () => number
}

type ContractsStore = ContractsState & ContractsActions

let db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      logger.error('Failed to open contracts DB', request.error, { module: 'ContractsStore' })
      reject(request.error)
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result
      if (!database.objectStoreNames.contains(STORE_CONTRACTS)) {
        database.createObjectStore(STORE_CONTRACTS, { keyPath: 'ownerKey' })
      }
      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
  })
}

async function loadFromDB(): Promise<{
  contractsByOwner: OwnerContracts[]
  lastUpdated: number | null
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CONTRACTS, STORE_META], 'readonly')
    const contractsStore = tx.objectStore(STORE_CONTRACTS)
    const metaStore = tx.objectStore(STORE_META)

    const contractsByOwner: OwnerContracts[] = []
    const contractsRequest = contractsStore.getAll()
    const metaRequest = metaStore.getAll()

    tx.oncomplete = () => {
      for (const stored of contractsRequest.result as StoredOwnerContracts[]) {
        contractsByOwner.push({ owner: stored.owner, contracts: stored.contracts })
      }

      let lastUpdated: number | null = null
      for (const meta of metaRequest.result) {
        if (meta.key === 'lastUpdated') lastUpdated = meta.value
      }

      resolve({ contractsByOwner, lastUpdated })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(contractsByOwner: OwnerContracts[], lastUpdated: number): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CONTRACTS, STORE_META], 'readwrite')
    const contractsStore = tx.objectStore(STORE_CONTRACTS)
    const metaStore = tx.objectStore(STORE_META)

    contractsStore.clear()
    for (const { owner, contracts } of contractsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      contractsStore.put({ ownerKey, owner, contracts } as StoredOwnerContracts)
    }

    metaStore.put({ key: 'lastUpdated', value: lastUpdated })

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CONTRACTS, STORE_META], 'readwrite')
    tx.objectStore(STORE_CONTRACTS).clear()
    tx.objectStore(STORE_META).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const useContractsStore = create<ContractsStore>((set, get) => ({
  contractsByOwner: [],
  lastUpdated: null,
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { contractsByOwner, lastUpdated } = await loadFromDB()
      set({ contractsByOwner, lastUpdated, initialized: true })
      logger.info('Contracts store initialized', {
        module: 'ContractsStore',
        owners: contractsByOwner.length,
        contracts: contractsByOwner.reduce((sum, o) => sum + o.contracts.length, 0),
      })
    } catch (err) {
      logger.error('Failed to load contracts from DB', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
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

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    if (!force && state.lastUpdated && Date.now() - state.lastUpdated < UPDATE_COOLDOWN_MS) {
      const minutes = Math.ceil((UPDATE_COOLDOWN_MS - (Date.now() - state.lastUpdated)) / 60000)
      set({ updateError: `Update available in ${minutes} minute${minutes === 1 ? '' : 's'}` })
      return
    }

    const owners = Object.values(useAuthStore.getState().owners).filter(
      (o) => o.type === 'character'
    )
    if (owners.length === 0) {
      set({ updateError: 'No characters logged in' })
      return
    }

    set({ isUpdating: true, updateError: null })

    try {
      const results: OwnerContracts[] = []

      for (const owner of owners) {
        try {
          logger.info('Fetching contracts', { module: 'ContractsStore', owner: owner.name })
          const contracts = await getCharacterContracts(owner.characterId)

          const contractsWithItems: ContractWithItems[] = []

          for (const contract of contracts) {
            let items: ESIContractItem[] = []

            if (contract.type === 'item_exchange' || contract.type === 'auction') {
              try {
                items = await getContractItems(owner.characterId, contract.contract_id)
              } catch {
                // May fail for finished/expired contracts
              }
            }

            contractsWithItems.push({ contract, items })
          }

          results.push({ owner, contracts: contractsWithItems })
        } catch (err) {
          logger.error('Failed to fetch contracts', err instanceof Error ? err : undefined, {
            module: 'ContractsStore',
            owner: owner.name,
          })
        }
      }

      const lastUpdated = Date.now()
      await saveToDB(results, lastUpdated)

      set({
        contractsByOwner: results,
        lastUpdated,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any contracts' : null,
      })

      logger.info('Contracts updated', {
        module: 'ContractsStore',
        owners: results.length,
        totalContracts: results.reduce((sum, r) => sum + r.contracts.length, 0),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isUpdating: false, updateError: message })
      logger.error('Contracts update failed', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
      })
    }
  },

  clear: async () => {
    await clearDB()
    set({
      contractsByOwner: [],
      lastUpdated: null,
      updateError: null,
    })
  },
}))
