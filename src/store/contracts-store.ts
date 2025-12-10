import { create } from 'zustand'
import { useAuthStore, type Owner } from './auth-store'
import {
  getCharacterContracts,
  getContractItems,
  getPublicContractItems,
  getCorporationContracts,
  getCorporationContractItems,
  type ESIContract,
  type ESIContractItem,
} from '@/api/endpoints/contracts'
import { esiClient } from '@/api/esi-client'
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
  updateForOwner: (owner: Owner) => Promise<void>
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
      const globalItemsCache = new Map<number, ESIContractItem[]>()
      for (const { contracts } of state.contractsByOwner) {
        for (const { contract, items } of contracts) {
          if (items.length > 0 && !globalItemsCache.has(contract.contract_id)) {
            globalItemsCache.set(contract.contract_id, items)
          }
        }
      }

      const results: OwnerContracts[] = []

      for (const owner of owners) {
        try {
          logger.info('Fetching contracts', { module: 'ContractsStore', owner: owner.name })

          const characterContracts = await getCharacterContracts(owner.characterId)

          let corpContracts: ESIContract[] = []
          if (owner.corporationId) {
            try {
              corpContracts = await getCorporationContracts(owner.characterId, owner.corporationId)
              logger.debug('Fetched corporation contracts', {
                module: 'ContractsStore',
                owner: owner.name,
                corpId: owner.corporationId,
                count: corpContracts.length,
              })
            } catch (err) {
              logger.debug('No corp contract access', {
                module: 'ContractsStore',
                owner: owner.name,
                error: err instanceof Error ? err.message : 'Unknown',
              })
            }
          }

          const seenIds = new Set(characterContracts.map(c => c.contract_id))
          const uniqueCorpContracts = corpContracts.filter(c => !seenIds.has(c.contract_id))
          const contracts = [...characterContracts, ...uniqueCorpContracts]

          logger.debug('Contracts merged', {
            module: 'ContractsStore',
            owner: owner.name,
            character: characterContracts.length,
            corp: corpContracts.length,
            uniqueCorp: uniqueCorpContracts.length,
            total: contracts.length,
          })

          const contractsToFetch: ESIContract[] = []
          const contractItemsMap = new Map<number, ESIContractItem[]>()
          let cachedCount = 0
          let skipped = 0

          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

          for (const contract of contracts) {
            if (contract.type !== 'item_exchange' && contract.type !== 'auction') {
              continue
            }

            const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
            if (!isActive) {
              skipped++
              continue
            }

            const cached = globalItemsCache.get(contract.contract_id)
            const isPublic = contract.availability === 'public'
            const hasItemIds = cached?.some((i: ESIContractItem) => i.item_id)
            const cacheValid = cached && cached.length > 0 && (!isPublic || hasItemIds)
            if (cacheValid) {
              contractItemsMap.set(contract.contract_id, cached)
              cachedCount++
              continue
            }

            const issuedDate = new Date(contract.date_issued).getTime()
            const isRecent = issuedDate >= thirtyDaysAgo

            if (!isRecent) {
              skipped++
              continue
            }

            contractsToFetch.push(contract)
          }

          if (contractsToFetch.length > 0) {
            logger.info('Fetching contract items', {
              module: 'ContractsStore',
              owner: owner.name,
              toFetch: contractsToFetch.length,
              cached: cachedCount,
              skipped,
            })

            const fetchedItems = await esiClient.fetchBatch(
              contractsToFetch,
              async (contract) => {
                if (contract.availability === 'public') {
                  return getPublicContractItems(contract.contract_id)
                }
                if (contract.for_corporation && owner.corporationId) {
                  return getCorporationContractItems(owner.characterId, owner.corporationId, contract.contract_id)
                }
                return getContractItems(owner.characterId, contract.contract_id)
              },
              { batchSize: 20 }
            )

            for (const [contract, items] of fetchedItems) {
              if (items) {
                contractItemsMap.set(contract.contract_id, items)
              }
            }
          }

          const contractsWithItems: ContractWithItems[] = contracts.map((contract) => ({
            contract,
            items: contractItemsMap.get(contract.contract_id) ?? [],
          }))

          results.push({ owner, contracts: contractsWithItems })
          logger.debug('Contract items', {
            module: 'ContractsStore',
            owner: owner.name,
            fetched: contractsToFetch.length,
            cached: cachedCount,
            skipped,
          })
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

  updateForOwner: async (owner: Owner) => {
    const state = get()
    try {
      logger.info('Fetching contracts for new owner', { module: 'ContractsStore', owner: owner.name })

      const globalItemsCache = new Map<number, ESIContractItem[]>()
      for (const { contracts } of state.contractsByOwner) {
        for (const { contract, items } of contracts) {
          if (items.length > 0 && !globalItemsCache.has(contract.contract_id)) {
            globalItemsCache.set(contract.contract_id, items)
          }
        }
      }

      const characterContracts = await getCharacterContracts(owner.characterId)

      let corpContracts: ESIContract[] = []
      if (owner.corporationId) {
        try {
          corpContracts = await getCorporationContracts(owner.characterId, owner.corporationId)
        } catch {
          // No corp access
        }
      }

      const seenIds = new Set(characterContracts.map(c => c.contract_id))
      const uniqueCorpContracts = corpContracts.filter(c => !seenIds.has(c.contract_id))
      const contracts = [...characterContracts, ...uniqueCorpContracts]

      const contractsToFetch: ESIContract[] = []
      const contractItemsMap = new Map<number, ESIContractItem[]>()
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

      for (const contract of contracts) {
        if (contract.type !== 'item_exchange' && contract.type !== 'auction') continue

        const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
        if (!isActive) continue

        const cached = globalItemsCache.get(contract.contract_id)
        const isPublic = contract.availability === 'public'
        const hasItemIds = cached?.some((i: ESIContractItem) => i.item_id)
        const cacheValid = cached && cached.length > 0 && (!isPublic || hasItemIds)
        if (cacheValid) {
          contractItemsMap.set(contract.contract_id, cached)
          continue
        }

        const issuedDate = new Date(contract.date_issued).getTime()
        if (issuedDate >= thirtyDaysAgo) {
          contractsToFetch.push(contract)
        }
      }

      for (const contract of contractsToFetch) {
        try {
          let items: ESIContractItem[]
          if (contract.availability === 'public') {
            items = await getPublicContractItems(contract.contract_id)
          } else if (owner.type === 'corporation') {
            items = await getCorporationContractItems(owner.characterId, owner.id, contract.contract_id)
          } else {
            items = await getContractItems(owner.characterId, contract.contract_id)
          }
          contractItemsMap.set(contract.contract_id, items)
        } catch {
          contractItemsMap.set(contract.contract_id, [])
        }
      }

      const contractsWithItems: ContractWithItems[] = contracts.map((contract) => ({
        contract,
        items: contractItemsMap.get(contract.contract_id) ?? [],
      }))

      const ownerKey = `${owner.type}-${owner.id}`
      const updated = state.contractsByOwner.filter(
        (oc) => `${oc.owner.type}-${oc.owner.id}` !== ownerKey
      )
      updated.push({ owner, contracts: contractsWithItems })

      const lastUpdated = Date.now()
      await saveToDB(updated, lastUpdated)

      set({ contractsByOwner: updated, lastUpdated })

      logger.info('Contracts updated for owner', {
        module: 'ContractsStore',
        owner: owner.name,
        contracts: contractsWithItems.length,
      })
    } catch (err) {
      logger.error('Failed to fetch contracts for owner', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
        owner: owner.name,
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
