import { create } from 'zustand'
import { useAuthStore, type Owner, type OwnerType, ownerKey, findOwnerByKey } from './auth-store'
import { useExpiryCacheStore } from './expiry-cache-store'
import { useToastStore } from './toast-store'
import {
  getContractItems as fetchContractItemsFromESI,
  getCorporationContractItems,
  type ESIContract,
  type ESIContractItem,
} from '@/api/endpoints/contracts'
import { esi, type ESIResponseMeta } from '@/api/esi'
import { ESIContractSchema } from '@/api/schemas'
import { logger } from '@/lib/logger'
import { formatNumber } from '@/lib/utils'
import { triggerResolution } from '@/lib/data-resolver'

const ENDPOINT_PATTERN = '/contracts/'
const DB_NAME = 'ecteveassets-contracts-v2'
const OLD_DB_NAME = 'ecteveassets-contracts'
const DB_VERSION = 1
const STORE_CONTRACTS = 'contracts'
const STORE_VISIBILITY = 'visibility'

interface SourceOwner {
  type: OwnerType
  id: number
  characterId: number
}

export interface StoredContract {
  contract: ESIContract
  items?: ESIContractItem[]
  sourceOwner: SourceOwner
}

export interface ContractWithItems {
  contract: ESIContract
  items?: ESIContractItem[]
}

export interface OwnerContracts {
  owner: Owner
  contracts: ContractWithItems[]
}

interface ContractsState {
  contractsById: Map<number, StoredContract>
  visibilityByOwner: Map<string, Set<number>>
  itemFetchesInProgress: Set<number>
  isUpdating: boolean
  updateError: string | null
  initialized: boolean
  updateCounter: number
}

interface ContractsActions {
  init: () => Promise<void>
  update: (force?: boolean) => Promise<void>
  updateForOwner: (owner: Owner) => Promise<void>
  fetchItemsForContract: (contractId: number) => Promise<ESIContractItem[] | undefined>
  removeForOwner: (ownerType: string, ownerId: number) => Promise<void>
  clear: () => Promise<void>
  getTotal: (prices: Map<number, number>, selectedOwnerIds: string[]) => number
  getContractsByOwner: () => OwnerContracts[]
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
        database.createObjectStore(STORE_CONTRACTS, { keyPath: 'contractId' })
      }
      if (!database.objectStoreNames.contains(STORE_VISIBILITY)) {
        database.createObjectStore(STORE_VISIBILITY, { keyPath: 'ownerKey' })
      }
    }
  })
}

interface StoredContractRecord {
  contractId: number
  contract: ESIContract
  items?: ESIContractItem[]
  sourceOwner: SourceOwner
}

interface VisibilityRecord {
  ownerKey: string
  contractIds: number[]
}

async function loadFromDB(): Promise<{
  contracts: Map<number, StoredContract>
  visibility: Map<string, Set<number>>
}> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CONTRACTS, STORE_VISIBILITY], 'readonly')
    const contractsStore = tx.objectStore(STORE_CONTRACTS)
    const visibilityStore = tx.objectStore(STORE_VISIBILITY)

    const contractsRequest = contractsStore.getAll()
    const visibilityRequest = visibilityStore.getAll()

    tx.oncomplete = () => {
      const contracts = new Map<number, StoredContract>()
      for (const record of contractsRequest.result as StoredContractRecord[]) {
        contracts.set(record.contractId, {
          contract: record.contract,
          items: record.items,
          sourceOwner: record.sourceOwner,
        })
      }

      const visibility = new Map<string, Set<number>>()
      for (const record of visibilityRequest.result as VisibilityRecord[]) {
        visibility.set(record.ownerKey, new Set(record.contractIds))
      }

      resolve({ contracts, visibility })
    }

    tx.onerror = () => reject(tx.error)
  })
}

async function saveContractToDB(contractId: number, stored: StoredContract): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CONTRACTS], 'readwrite')
    const store = tx.objectStore(STORE_CONTRACTS)
    store.put({
      contractId,
      contract: stored.contract,
      items: stored.items,
      sourceOwner: stored.sourceOwner,
    } as StoredContractRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function saveVisibilityToDB(ownerKeyStr: string, contractIds: Set<number>): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_VISIBILITY], 'readwrite')
    const store = tx.objectStore(STORE_VISIBILITY)
    store.put({
      ownerKey: ownerKeyStr,
      contractIds: [...contractIds],
    } as VisibilityRecord)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteVisibilityFromDB(ownerKeyStr: string): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_VISIBILITY], 'readwrite')
    const store = tx.objectStore(STORE_VISIBILITY)
    store.delete(ownerKeyStr)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearDB(): Promise<void> {
  const database = await openDB()

  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_CONTRACTS, STORE_VISIBILITY], 'readwrite')
    tx.objectStore(STORE_CONTRACTS).clear()
    tx.objectStore(STORE_VISIBILITY).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function migrateFromOldDB(): Promise<{
  contracts: Map<number, StoredContract>
  visibility: Map<string, Set<number>>
} | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(OLD_DB_NAME)

    request.onerror = () => {
      resolve(null)
    }

    request.onsuccess = () => {
      const oldDb = request.result
      if (!oldDb.objectStoreNames.contains('contracts')) {
        oldDb.close()
        resolve(null)
        return
      }

      const tx = oldDb.transaction(['contracts'], 'readonly')
      const store = tx.objectStore('contracts')
      const getAllRequest = store.getAll()

      tx.oncomplete = async () => {
        const oldData = getAllRequest.result as Array<{ key: string; owner: Owner; contracts: ContractWithItems[] }>

        if (!oldData || oldData.length === 0) {
          oldDb.close()
          resolve(null)
          return
        }

        const contracts = new Map<number, StoredContract>()
        const visibility = new Map<string, Set<number>>()

        for (const entry of oldData) {
          const ownerKeyStr = ownerKey(entry.owner.type, entry.owner.id)
          const ownerVisibility = new Set<number>()

          for (const cwi of entry.contracts) {
            ownerVisibility.add(cwi.contract.contract_id)

            if (!contracts.has(cwi.contract.contract_id)) {
              contracts.set(cwi.contract.contract_id, {
                contract: cwi.contract,
                items: cwi.items,
                sourceOwner: {
                  type: entry.owner.type,
                  id: entry.owner.id,
                  characterId: entry.owner.characterId,
                },
              })
            } else if (cwi.items && !contracts.get(cwi.contract.contract_id)!.items) {
              contracts.get(cwi.contract.contract_id)!.items = cwi.items
            }
          }

          visibility.set(ownerKeyStr, ownerVisibility)
        }

        oldDb.close()

        try {
          indexedDB.deleteDatabase(OLD_DB_NAME)
          logger.info('Migrated contracts from old DB format', {
            module: 'ContractsStore',
            contracts: contracts.size,
            owners: visibility.size,
          })
        } catch {
          logger.warn('Failed to delete old contracts DB', { module: 'ContractsStore' })
        }

        resolve({ contracts, visibility })
      }

      tx.onerror = () => {
        oldDb.close()
        resolve(null)
      }
    }
  })
}

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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const ACTIVE_STATUSES = new Set(['outstanding', 'in_progress'])
const FINISHED_STATUSES = new Set(['finished', 'finished_issuer', 'finished_contractor'])

function canFetchItems(contract: ESIContract): boolean {
  if (contract.type !== 'item_exchange' && contract.type !== 'auction') return false

  if (ACTIVE_STATUSES.has(contract.status)) {
    return true
  }

  if (FINISHED_STATUSES.has(contract.status)) {
    const refTime = new Date(contract.date_completed ?? contract.date_expired).getTime()
    return Date.now() - refTime < THIRTY_DAYS_MS
  }

  return false
}

async function fetchItemsForContractFromAPI(
  sourceOwner: SourceOwner,
  contractId: number
): Promise<ESIContractItem[]> {
  if (sourceOwner.type === 'corporation') {
    return getCorporationContractItems(sourceOwner.characterId, sourceOwner.id, contractId)
  }
  return fetchContractItemsFromESI(sourceOwner.characterId, contractId)
}

export const useContractsStore = create<ContractsStore>((set, get) => ({
  contractsById: new Map(),
  visibilityByOwner: new Map(),
  itemFetchesInProgress: new Set(),
  isUpdating: false,
  updateError: null,
  initialized: false,
  updateCounter: 0,

  init: async () => {
    if (get().initialized) return

    try {
      let { contracts, visibility } = await loadFromDB()

      if (contracts.size === 0) {
        const migrated = await migrateFromOldDB()
        if (migrated) {
          contracts = migrated.contracts
          visibility = migrated.visibility

          for (const [contractId, stored] of contracts) {
            await saveContractToDB(contractId, stored)
          }
          for (const [ownerKeyStr, contractIds] of visibility) {
            await saveVisibilityToDB(ownerKeyStr, contractIds)
          }
        }
      }

      set((s) => ({
        contractsById: contracts,
        visibilityByOwner: visibility,
        initialized: true,
        updateCounter: s.updateCounter + 1,
      }))

      if (contracts.size > 0) {
        triggerResolution()
      }

      logger.info('Contracts store initialized', {
        module: 'ContractsStore',
        contracts: contracts.size,
        owners: visibility.size,
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
    if (!state.initialized) {
      await get().init()
    }
    if (get().isUpdating) return

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
          const key = `${owner.type}-${owner.id}`
          const endpoint = getContractsEndpoint(owner)
          return expiryCacheStore.isExpired(key, endpoint)
        })

    if (ownersToUpdate.length === 0) return

    set({ isUpdating: true, updateError: null })

    try {
      const contractsById = new Map(get().contractsById)
      const visibilityByOwner = new Map(get().visibilityByOwner)
      const itemFetchesInProgress = get().itemFetchesInProgress

      for (const owner of ownersToUpdate) {
        const currentOwnerKey = ownerKey(owner.type, owner.id)
        const endpoint = getContractsEndpoint(owner)

        try {
          logger.info('Fetching contracts', { module: 'ContractsStore', owner: owner.name })

          const { data: contracts, expiresAt, etag } = await fetchOwnerContractsWithMeta(owner)

          const ownerVisibility = new Set<number>()
          const contractsToFetchItems: ESIContract[] = []

          for (const contract of contracts) {
            ownerVisibility.add(contract.contract_id)

            if (!contractsById.has(contract.contract_id)) {
              const stored: StoredContract = {
                contract,
                items: undefined,
                sourceOwner: { type: owner.type, id: owner.id, characterId: owner.characterId },
              }
              contractsById.set(contract.contract_id, stored)
              await saveContractToDB(contract.contract_id, stored)
            } else {
              const existing = contractsById.get(contract.contract_id)!
              if (existing.contract.status !== contract.status) {
                existing.contract = contract
                await saveContractToDB(contract.contract_id, existing)
              }
            }

            const stored = contractsById.get(contract.contract_id)!
            const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
            if (
              canFetchItems(contract) &&
              isActive &&
              !stored.items &&
              !itemFetchesInProgress.has(contract.contract_id)
            ) {
              contractsToFetchItems.push(contract)
            }
          }

          visibilityByOwner.set(currentOwnerKey, ownerVisibility)
          await saveVisibilityToDB(currentOwnerKey, ownerVisibility)

          if (contractsToFetchItems.length > 0) {
            logger.info('Fetching contract items', {
              module: 'ContractsStore',
              owner: owner.name,
              toFetch: contractsToFetchItems.length,
            })

            for (const contract of contractsToFetchItems) {
              itemFetchesInProgress.add(contract.contract_id)
            }
            set({ itemFetchesInProgress: new Set(itemFetchesInProgress) })

            for (const contract of contractsToFetchItems) {
              try {
                const stored = contractsById.get(contract.contract_id)!
                const items = await fetchItemsForContractFromAPI(stored.sourceOwner, contract.contract_id)
                stored.items = items
                await saveContractToDB(contract.contract_id, stored)
              } catch (err) {
                logger.error('Failed to fetch items for contract', err instanceof Error ? err : undefined, {
                  module: 'ContractsStore',
                  contractId: contract.contract_id,
                })
              } finally {
                itemFetchesInProgress.delete(contract.contract_id)
              }
            }
            set({ itemFetchesInProgress: new Set(itemFetchesInProgress) })
          }

          useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, contracts.length === 0)
        } catch (err) {
          logger.error('Failed to fetch contracts', err instanceof Error ? err : undefined, {
            module: 'ContractsStore',
            owner: owner.name,
          })
        }
      }

      set((s) => ({
        contractsById,
        visibilityByOwner,
        isUpdating: false,
        updateError: contractsById.size === 0 ? 'Failed to fetch any contracts' : null,
        updateCounter: s.updateCounter + 1,
      }))

      triggerResolution()

      logger.info('Contracts updated', {
        module: 'ContractsStore',
        owners: ownersToUpdate.length,
        totalContracts: contractsById.size,
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
    if (!state.initialized) {
      await get().init()
    }

    try {
      const currentOwnerKey = ownerKey(owner.type, owner.id)
      const endpoint = getContractsEndpoint(owner)

      const previousVisibility = state.visibilityByOwner.get(currentOwnerKey) ?? new Set()
      const previousStatusMap = new Map<number, string>()
      for (const contractId of previousVisibility) {
        const stored = state.contractsById.get(contractId)
        if (stored) {
          previousStatusMap.set(contractId, stored.contract.status)
        }
      }

      logger.info('Fetching contracts for owner', { module: 'ContractsStore', owner: owner.name })

      const { data: contracts, expiresAt, etag } = await fetchOwnerContractsWithMeta(owner)

      const contractsById = new Map(state.contractsById)
      const visibilityByOwner = new Map(state.visibilityByOwner)
      const itemFetchesInProgress = state.itemFetchesInProgress

      const ownerVisibility = new Set<number>()
      const contractsToFetchItems: ESIContract[] = []

      for (const contract of contracts) {
        ownerVisibility.add(contract.contract_id)

        if (!contractsById.has(contract.contract_id)) {
          const stored: StoredContract = {
            contract,
            items: undefined,
            sourceOwner: { type: owner.type, id: owner.id, characterId: owner.characterId },
          }
          contractsById.set(contract.contract_id, stored)
          await saveContractToDB(contract.contract_id, stored)
        } else {
          const existing = contractsById.get(contract.contract_id)!
          if (existing.contract.status !== contract.status) {
            existing.contract = contract
            await saveContractToDB(contract.contract_id, existing)
          }
        }

        const stored = contractsById.get(contract.contract_id)!
        const isActive = contract.status === 'outstanding' || contract.status === 'in_progress'
        if (
          canFetchItems(contract) &&
          isActive &&
          !stored.items &&
          !itemFetchesInProgress.has(contract.contract_id)
        ) {
          contractsToFetchItems.push(contract)
        }
      }

      visibilityByOwner.set(currentOwnerKey, ownerVisibility)
      await saveVisibilityToDB(currentOwnerKey, ownerVisibility)

      const toastStore = useToastStore.getState()
      const ownerId = owner.type === 'corporation' ? owner.id : owner.characterId
      const allOwners = Object.values(useAuthStore.getState().owners).filter((o): o is Owner => !!o)
      const allOwnerIds = new Set(allOwners.map((o) => (o.type === 'corporation' ? o.id : o.characterId)))

      for (const contract of contracts) {
        const prevStatus = previousStatusMap.get(contract.contract_id)
        const isNewContract = !previousStatusMap.has(contract.contract_id)
        const wasActive = prevStatus === 'outstanding' || prevStatus === 'in_progress'

        const weAreIssuer =
          owner.type === 'corporation'
            ? contract.issuer_corporation_id === owner.id
            : contract.issuer_id === owner.characterId
        const weAreAssignee = contract.assignee_id === ownerId
        const issuerIsOurOwner = allOwnerIds.has(contract.issuer_id)

        if (isNewContract && weAreAssignee && !issuerIsOurOwner && contract.status === 'outstanding') {
          const price = contract.price ?? 0
          toastStore.addToast(
            'contract-accepted',
            'New Contract Assigned',
            price > 0 ? `${formatNumber(price)} ISK` : 'Item exchange'
          )
          logger.info('New contract assigned', {
            module: 'ContractsStore',
            owner: owner.name,
            contractId: contract.contract_id,
          })
        }

        if (wasActive && contract.status === 'finished' && weAreIssuer && !allOwnerIds.has(contract.acceptor_id)) {
          const price = contract.price ?? 0
          toastStore.addToast(
            'contract-accepted',
            'Contract Completed',
            price > 0 ? `${formatNumber(price)} ISK` : 'Item exchange'
          )
          logger.info('Contract completed', {
            module: 'ContractsStore',
            owner: owner.name,
            contractId: contract.contract_id,
          })
        }
      }

      if (contractsToFetchItems.length > 0) {
        for (const contract of contractsToFetchItems) {
          itemFetchesInProgress.add(contract.contract_id)
        }
        set({ itemFetchesInProgress: new Set(itemFetchesInProgress) })

        for (const contract of contractsToFetchItems) {
          try {
            const stored = contractsById.get(contract.contract_id)!
            const items = await fetchItemsForContractFromAPI(stored.sourceOwner, contract.contract_id)
            stored.items = items
            await saveContractToDB(contract.contract_id, stored)
          } catch (err) {
            logger.error('Failed to fetch items for contract', err instanceof Error ? err : undefined, {
              module: 'ContractsStore',
              contractId: contract.contract_id,
            })
          } finally {
            itemFetchesInProgress.delete(contract.contract_id)
          }
        }
        set({ itemFetchesInProgress: new Set(itemFetchesInProgress) })
      }

      useExpiryCacheStore.getState().setExpiry(currentOwnerKey, endpoint, expiresAt, etag, contracts.length === 0)

      set((s) => ({
        contractsById,
        visibilityByOwner,
        updateCounter: s.updateCounter + 1,
      }))

      triggerResolution()

      logger.info('Contracts updated for owner', {
        module: 'ContractsStore',
        owner: owner.name,
        contracts: contracts.length,
      })
    } catch (err) {
      logger.error('Failed to fetch contracts for owner', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
        owner: owner.name,
      })
    }
  },

  fetchItemsForContract: async (contractId: number) => {
    const state = get()
    const stored = state.contractsById.get(contractId)

    if (!stored) return undefined
    if (stored.items) return stored.items
    if (!canFetchItems(stored.contract)) return undefined
    if (state.itemFetchesInProgress.has(contractId)) return undefined

    try {
      const itemFetchesInProgress = new Set(state.itemFetchesInProgress)
      itemFetchesInProgress.add(contractId)
      set({ itemFetchesInProgress })

      const items = await fetchItemsForContractFromAPI(stored.sourceOwner, contractId)
      stored.items = items
      await saveContractToDB(contractId, stored)

      itemFetchesInProgress.delete(contractId)
      set((s) => ({
        contractsById: new Map(s.contractsById),
        itemFetchesInProgress,
        updateCounter: s.updateCounter + 1,
      }))

      triggerResolution()
      return items
    } catch (err) {
      logger.error('Failed to fetch contract items', err instanceof Error ? err : undefined, {
        module: 'ContractsStore',
        contractId,
      })

      const itemFetchesInProgress = new Set(get().itemFetchesInProgress)
      itemFetchesInProgress.delete(contractId)
      set({ itemFetchesInProgress })

      return undefined
    }
  },

  removeForOwner: async (ownerType: string, ownerId: number) => {
    const state = get()
    const currentOwnerKey = `${ownerType}-${ownerId}`

    if (!state.visibilityByOwner.has(currentOwnerKey)) return

    const visibilityByOwner = new Map(state.visibilityByOwner)
    visibilityByOwner.delete(currentOwnerKey)

    await deleteVisibilityFromDB(currentOwnerKey)

    set({ visibilityByOwner })

    useExpiryCacheStore.getState().clearForOwner(currentOwnerKey)

    logger.info('Contracts removed for owner', { module: 'ContractsStore', ownerKey: currentOwnerKey })
  },

  clear: async () => {
    await clearDB()
    set({
      contractsById: new Map(),
      visibilityByOwner: new Map(),
      itemFetchesInProgress: new Set(),
      updateError: null,
      initialized: false,
    })
  },

  getTotal: (prices, selectedOwnerIds) => {
    const state = get()
    const selectedSet = new Set(selectedOwnerIds)
    const allOwners = Object.values(useAuthStore.getState().owners).filter((o): o is Owner => !!o)
    const ownerCharIds = new Set(allOwners.map((o) => o.characterId))
    const ownerCorpIds = new Set(
      allOwners.filter((o) => o.corporationId).map((o) => o.corporationId)
    )

    const visibleContractIds = new Set<number>()
    for (const [key, contractIds] of state.visibilityByOwner) {
      if (selectedSet.has(key)) {
        for (const id of contractIds) {
          visibleContractIds.add(id)
        }
      }
    }

    let total = 0
    for (const contractId of visibleContractIds) {
      const stored = state.contractsById.get(contractId)
      if (!stored) continue

      const { contract, items } = stored
      if (contract.status !== 'outstanding' && contract.status !== 'in_progress') continue

      total += contract.collateral ?? 0

      if (contract.status === 'outstanding' && items) {
        const isIssuer =
          ownerCharIds.has(contract.issuer_id) || ownerCorpIds.has(contract.issuer_corporation_id)
        if (isIssuer) {
          for (const item of items) {
            if (!item.is_included) continue
            total += (prices.get(item.type_id) ?? 0) * item.quantity
          }
        }
      }
    }
    return total
  },

  getContractsByOwner: () => {
    const state = get()
    const result: OwnerContracts[] = []

    for (const [ownerKeyStr, contractIds] of state.visibilityByOwner) {
      const owner = findOwnerByKey(ownerKeyStr)
      if (!owner) continue

      const contracts: ContractWithItems[] = []
      for (const contractId of contractIds) {
        const stored = state.contractsById.get(contractId)
        if (stored) {
          contracts.push({ contract: stored.contract, items: stored.items })
        }
      }

      result.push({ owner, contracts })
    }

    return result
  },
}))

// Backward compatibility: expose contractsByOwner as a selector
Object.defineProperty(useContractsStore, 'contractsByOwner', {
  get: () => useContractsStore.getState().getContractsByOwner(),
})

useExpiryCacheStore.getState().registerRefreshCallback(ENDPOINT_PATTERN, async (ownerKeyStr) => {
  const owner = findOwnerByKey(ownerKeyStr)
  if (!owner) {
    logger.warn('Owner not found for refresh', { module: 'ContractsStore', ownerKey: ownerKeyStr })
    return
  }
  await useContractsStore.getState().updateForOwner(owner)
})
