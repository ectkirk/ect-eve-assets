import { create } from 'zustand'
import { useAuthStore, type Owner, ownerKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import {
  getContractItems,
  getPublicContractItems,
  getCorporationContractItems,
  type ESIContract,
  type ESIContractItem,
} from '@/api/endpoints/contracts'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIContractSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'

const ENDPOINT_PATTERN = '/contracts/'

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
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
}

interface ContractsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
}

type ContractsStore = ContractsState & ContractsActions

let db: IDBDatabase | null = null

function getContractsEndpoint(owner: Owner): string {
  if (owner.type === 'corporation') {
    return `/corporations/${owner.id}/contracts/`
  }
  return `/characters/${owner.characterId}/contracts/`
}

async function fetchOwnerContractsWithMeta(owner: Owner): Promise<ESIResponseMeta<ESIContract[]>> {
  const endpoint = getContractsEndpoint(owner)
  const result = await esi.fetchPaginatedWithMeta<ESIContract>(endpoint, {
    characterId: owner.characterId,
    schema: ESIContractSchema,
  })
  if (owner.type === 'character') {
    result.data = result.data.filter((c) => !c.for_corporation)
  }
  return result
}

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

async function loadFromDB(): Promise<{ contractsByOwner: OwnerContracts[] }> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CONTRACTS], 'readonly')
    const contractsStore = tx.objectStore(STORE_CONTRACTS)

    const contractsByOwner: OwnerContracts[] = []
    const contractsRequest = contractsStore.getAll()

    tx.oncomplete = () => {
      for (const stored of contractsRequest.result as StoredOwnerContracts[]) {
        contractsByOwner.push({ owner: stored.owner, contracts: stored.contracts })
      }
      resolve({ contractsByOwner })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveToDB(contractsByOwner: OwnerContracts[]): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CONTRACTS], 'readwrite')
    const contractsStore = tx.objectStore(STORE_CONTRACTS)

    contractsStore.clear()
    for (const { owner, contracts } of contractsByOwner) {
      const ownerKey = `${owner.type}-${owner.id}`
      contractsStore.put({ ownerKey, owner, contracts } as StoredOwnerContracts)
    }

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
  isUpdating: false,
  updateError: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return

    try {
      const { contractsByOwner } = await loadFromDB()
      set({ contractsByOwner, initialized: true })
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

  update: async (force = false) => {
    const state = get()
    if (state.isUpdating) return

    const allOwners = Object.values(useAuthStore.getState().owners)
    if (allOwners.length === 0) {
      set({ updateError: 'No owners logged in' })
      return
    }

    const expiryCacheStore = useExpiryCacheStore.getState()

    const ownersToUpdate = force
      ? allOwners.filter((o): o is Owner => o !== undefined && !o.authFailed)
      : allOwners.filter((owner): owner is Owner => {
          if (!owner || owner.authFailed) return false
          const ownerKey = `${owner.type}-${owner.id}`
          const endpoint = getContractsEndpoint(owner)
          return expiryCacheStore.isExpired(ownerKey, endpoint)
        })

    if (ownersToUpdate.length === 0) {
      logger.debug('No owners need contracts update', { module: 'ContractsStore' })
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

      const existingContracts = new Map(
        state.contractsByOwner.map((oc) => [`${oc.owner.type}-${oc.owner.id}`, oc])
      )

      for (const owner of ownersToUpdate) {
        const currentOwnerKey = ownerKey(owner.type, owner.id)
        const endpoint = getContractsEndpoint(owner)

        try {
          logger.info('Fetching contracts', { module: 'ContractsStore', owner: owner.name })

          const { data: contracts, expiresAt, etag } = await fetchOwnerContractsWithMeta(owner)

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

            const fetchedItems = await esi.fetchBatch(
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

          existingContracts.set(currentOwnerKey, { owner, contracts: contractsWithItems })

          useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag)

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

      const results = Array.from(existingContracts.values())

      await saveToDB(results)

      set({
        contractsByOwner: results,
        isUpdating: false,
        updateError: results.length === 0 ? 'Failed to fetch any contracts' : null,
      })

      logger.info('Contracts updated', {
        module: 'ContractsStore',
        owners: ownersToUpdate.length,
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
      const currentOwnerKey = ownerKey(owner.type, owner.id)
      const endpoint = getContractsEndpoint(owner)

      logger.info('Fetching contracts for owner', { module: 'ContractsStore', owner: owner.name })

      const globalItemsCache = new Map<number, ESIContractItem[]>()
      for (const { contracts } of state.contractsByOwner) {
        for (const { contract, items } of contracts) {
          if (items.length > 0 && !globalItemsCache.has(contract.contract_id)) {
            globalItemsCache.set(contract.contract_id, items)
          }
        }
      }

      const { data: contracts, expiresAt, etag } = await fetchOwnerContractsWithMeta(owner)

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

      useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag)

      const updated = state.contractsByOwner.filter(
        (oc) => `${oc.owner.type}-${oc.owner.id}` !== currentOwnerKey
      )
      updated.push({ owner, contracts: contractsWithItems })

      await saveToDB(updated)

      set({ contractsByOwner: updated })

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

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const ownerKey = `${ownerType}-${ownerId}`
    const updated = state.contractsByOwner.filter(
      (oc) => `${oc.owner.type}-${oc.owner.id}` !== ownerKey
    )

    if (updated.length === state.contractsByOwner.length) return

    await saveToDB(updated)
    set({ contractsByOwner: updated })

    useExpiryCacheStore.getState().clearForOwner(ownerKey)

    logger.info('Contracts removed for owner', { module: 'ContractsStore', ownerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      contractsByOwner: [],
      updateError: null,
    })
  },
}))

function findOwnerByKey(ownerKeyStr: string): Owner | undefined {
  const owners = useAuthStore.getState().owners
  for (const owner of Object.values(owners)) {
    if (owner && ownerKey(owner.type, owner.id) === ownerKeyStr) {
      return owner
    }
  }
  return undefined
}

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'ContractsStore', ownerKey: ownerKeyStr })
    return
  }
  await useContractsStore.getState().updateForOwner(owner)
})
